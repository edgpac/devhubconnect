/**
 * bulk-fix-error-gaps.mjs
 *
 * Fixes three production-hardening gaps across all workflows:
 *
 *  GAP-A  Add continueOnFail: true to unprotected critical nodes on the
 *         responseNode webhook → respondToWebhook path
 *
 *  GAP-B  Remove bogus settings.errorWorkflow values (non-numeric slugs)
 *
 *  GAP-C  Delete orphaned error nodes that are unreachable from any trigger
 *         and have no incoming or outgoing connections
 *
 * Run:      node scripts/bulk-fix-error-gaps.mjs
 * Dry-run:  node scripts/bulk-fix-error-gaps.mjs --dry-run
 */

import pg from 'pg';
const { Pool } = pg;

const DRY_RUN = process.argv.includes('--dry-run');

const pool = new Pool({
  connectionString: 'postgresql://postgres:atUkFxuogjjZODArPEnnbgUtSlZZswCe@ballast.proxy.rlwy.net:59419/railway',
});

// Node types that make external calls or run user code and can fail in ways
// that would leave a responseNode webhook hanging. Routing/transform nodes
// (if, switch, set, aggregate, etc.) are intentionally excluded — they
// process in-memory and their failure mode does not cause webhook hangs.
const CRITICAL_TYPES = new Set([
  // HTTP / generic
  'n8n-nodes-base.httpRequest',
  // User code
  'n8n-nodes-base.code',
  // LLM / AI
  '@n8n/n8n-nodes-langchain.agent',
  '@n8n/n8n-nodes-langchain.chainLlm',
  '@n8n/n8n-nodes-langchain.chainRetrievalQa',
  '@n8n/n8n-nodes-langchain.openAi',
  '@n8n/n8n-nodes-langchain.vectorStoreQdrant',
  'n8n-nodes-base.openAi',
  // Databases
  'n8n-nodes-base.supabase',
  'n8n-nodes-base.postgres',
  // Google
  'n8n-nodes-base.googleCalendar',
  'n8n-nodes-base.gmail',
  'n8n-nodes-base.googleSheets',
  'n8n-nodes-base.googleDrive',
  'n8n-nodes-base.googleDocs',
  // Messaging / comms
  'n8n-nodes-base.slack',
  'n8n-nodes-base.telegram',
  'n8n-nodes-base.discord',
  'n8n-nodes-base.whatsApp',
  'n8n-nodes-base.twilio',
  'n8n-nodes-base.vonage',
  'n8n-nodes-base.emailSend',
  'n8n-nodes-base.emailReadImap',
  'n8n-nodes-base.sendGrid',
  'n8n-nodes-base.mailgun',
  'n8n-nodes-base.mailchimp',
  'n8n-nodes-base.microsoftOutlook',
  // CRM / marketing
  'n8n-nodes-base.hubspot',
  'n8n-nodes-base.pipedrive',
  'n8n-nodes-base.airtable',
  'n8n-nodes-base.mautic',
  // Payments
  'n8n-nodes-base.stripe',
  'n8n-nodes-base.quickbooks',
  'n8n-nodes-base.paddle',
  // E-commerce
  'n8n-nodes-base.wooCommerce',
  'n8n-nodes-base.shopify',
  // Dev / productivity
  'n8n-nodes-base.wordpress',
  'n8n-nodes-base.todoist',
  'n8n-nodes-base.trello',
  // Merge is a choke point before final response
  'n8n-nodes-base.merge',
]);

const RESPOND_TYPES = new Set(['n8n-nodes-base.respondToWebhook']);

// ── Graph helpers ─────────────────────────────────────────────────────────────

function reachableFrom(startName, connections) {
  const visited = new Set();
  const queue = [startName];
  while (queue.length) {
    const cur = queue.shift();
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const targets of (connections[cur]?.main || [])) {
      for (const e of (targets || [])) queue.push(e.node);
    }
  }
  return visited;
}

function ancestorsOf(targetName, connections) {
  // Build reverse adjacency (main edges only)
  const reverse = {};
  for (const [from, conn] of Object.entries(connections)) {
    for (const targets of (conn.main || [])) {
      for (const edge of (targets || [])) {
        (reverse[edge.node] ??= []).push(from);
      }
    }
  }
  const visited = new Set();
  const queue = [targetName];
  while (queue.length) {
    const cur = queue.shift();
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const p of (reverse[cur] || [])) queue.push(p);
  }
  return visited;
}

// ── Per-workflow fix ──────────────────────────────────────────────────────────

function fixWorkflow(wf) {
  const nodes = wf.nodes || [];
  const connections = wf.connections || {};
  const fixes = { gapA: 0, gapB: false, gapC: 0 };

  // ── GAP-B ─────────────────────────────────────────────────────────────────
  const ew = wf.settings?.errorWorkflow;
  if (ew && !/^\d+$/.test(String(ew))) {
    delete wf.settings.errorWorkflow;
    fixes.gapB = true;
  }

  // ── GAP-A ─────────────────────────────────────────────────────────────────
  const responseNodeWebhooks = nodes.filter(
    n => n.type === 'n8n-nodes-base.webhook' && n.parameters?.responseMode === 'responseNode'
  );

  // Collect every node name that should get continueOnFail
  const toHarden = new Set();

  for (const webhook of responseNodeWebhooks) {
    const reachable = reachableFrom(webhook.name, connections);
    const respondNodes = nodes.filter(n => RESPOND_TYPES.has(n.type) && reachable.has(n.name));
    for (const respNode of respondNodes) {
      const ancestors = ancestorsOf(respNode.name, connections);
      for (const n of nodes) {
        if (
          ancestors.has(n.name) &&
          n.name !== webhook.name &&
          CRITICAL_TYPES.has(n.type) &&
          !n.continueOnFail
        ) {
          toHarden.add(n.name);
        }
      }
    }
  }

  // ── GAP-C ─────────────────────────────────────────────────────────────────
  // Collect all nodes that ARE a connection target (have at least one incoming edge)
  const hasIncoming = new Set();
  for (const conn of Object.values(connections)) {
    for (const targets of (conn.main || [])) {
      for (const e of (targets || [])) hasIncoming.add(e.node);
    }
    // Also ai_ edges
    for (const [type, outputs] of Object.entries(conn)) {
      if (type === 'main') continue;
      for (const targets of (outputs || [])) {
        for (const e of (targets || [])) hasIncoming.add(e.node);
      }
    }
  }

  // Collect all nodes that have outgoing connections
  const hasOutgoing = new Set(Object.keys(connections));

  // Triggers for reachability check
  const triggers = nodes.filter(n =>
    n.type.includes('trigger') || n.type.includes('webhook') || n.type.includes('schedule')
  );
  const allReachable = new Set();
  for (const t of triggers) {
    for (const name of reachableFrom(t.name, connections)) allReachable.add(name);
  }

  const toDelete = new Set();
  for (const n of nodes) {
    const nameL = n.name.toLowerCase();
    const isErrorNode =
      /error.?handler|error.?check|errorhandler/i.test(n.name) ||
      (nameL.includes('error') && !RESPOND_TYPES.has(n.type));

    if (
      isErrorNode &&
      !allReachable.has(n.name) &&
      !hasIncoming.has(n.name) &&
      !hasOutgoing.has(n.name)
    ) {
      toDelete.add(n.name);
    }
  }

  // ── Apply changes ─────────────────────────────────────────────────────────
  let changed = false;

  if (toHarden.size > 0) {
    wf.nodes = nodes.map(n =>
      toHarden.has(n.name) ? { ...n, continueOnFail: true } : n
    );
    fixes.gapA = toHarden.size;
    changed = true;
  }

  if (fixes.gapB) changed = true;

  if (toDelete.size > 0) {
    wf.nodes = (wf.nodes || nodes).filter(n => !toDelete.has(n.name));
    // Clean up any connection entries for deleted nodes
    for (const name of toDelete) delete wf.connections[name];
    fixes.gapC = toDelete.size;
    changed = true;
  }

  return { changed, fixes };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const client = await pool.connect();
  const { rows } = await client.query('SELECT id, name, workflow_json FROM templates ORDER BY id');
  console.log(`Loaded ${rows.length} workflows.\n`);

  let totalA = 0, totalB = 0, totalC = 0;
  let wfsA = 0, wfsB = 0, wfsC = 0;
  let wfsChanged = 0;

  for (const row of rows) {
    const { id, name, workflow_json: wf } = row;
    if (!wf) continue;

    const { changed, fixes } = fixWorkflow(wf);
    if (!changed) continue;

    wfsChanged++;
    const parts = [];
    if (fixes.gapA) { parts.push(`A:+continueOnFail×${fixes.gapA}`); totalA += fixes.gapA; wfsA++; }
    if (fixes.gapB) { parts.push('B:removed errorWorkflow slug');    totalB++;               wfsB++; }
    if (fixes.gapC) { parts.push(`C:removed ${fixes.gapC} dead node(s)`); totalC += fixes.gapC; wfsC++; }

    console.log(`[${id}] ${name}`);
    console.log(`  → ${parts.join('  ')}`);

    if (!DRY_RUN) {
      await client.query('UPDATE templates SET workflow_json = $1 WHERE id = $2', [
        JSON.stringify(wf), id,
      ]);
    }
  }

  console.log('\n════════════════════════════════════════');
  console.log('SUMMARY');
  console.log(`  🔴 GAP-A  continueOnFail added : ${totalA} nodes across ${wfsA} workflows`);
  console.log(`  🟡 GAP-B  errorWorkflow removed : ${wfsB} workflows`);
  console.log(`  🟠 GAP-C  dead nodes removed    : ${totalC} nodes across ${wfsC} workflows`);
  console.log(`  Total workflows updated         : ${wfsChanged}`);
  if (DRY_RUN) console.log('\n[DRY RUN] No changes written. Remove --dry-run to apply.');

  client.release();
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
