/**
 * scan-error-handler-gaps.mjs
 *
 * Scans all workflows for three production-hardening gaps:
 *
 *  GAP-A  responseNode webhook + zero continueOnFail on the response path
 *         → webhook can hang on any failure
 *
 *  GAP-B  settings.errorWorkflow is a non-numeric slug (placeholder, not a real n8n ID)
 *         → global error workflow reference is dead config
 *
 *  GAP-C  Nodes whose name contains "error" or "Error" that are not reachable
 *         from any trigger and not connected to anything
 *         → decorative dead nodes
 */

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:atUkFxuogjjZODArPEnnbgUtSlZZswCe@ballast.proxy.rlwy.net:59419/railway',
});

// Node types that terminate a webhook response path
const RESPOND_TYPES = new Set(['n8n-nodes-base.respondToWebhook']);

// Node types that make external calls or run user code and can fail in ways
// that would leave a responseNode webhook hanging. Routing/transform nodes
// (if, switch, set, aggregate, etc.) are intentionally excluded.
const CRITICAL_TYPES = new Set([
  'n8n-nodes-base.httpRequest',
  'n8n-nodes-base.code',
  '@n8n/n8n-nodes-langchain.agent',
  '@n8n/n8n-nodes-langchain.chainLlm',
  '@n8n/n8n-nodes-langchain.chainRetrievalQa',
  '@n8n/n8n-nodes-langchain.openAi',
  '@n8n/n8n-nodes-langchain.vectorStoreQdrant',
  'n8n-nodes-base.openAi',
  'n8n-nodes-base.supabase',
  'n8n-nodes-base.postgres',
  'n8n-nodes-base.googleCalendar',
  'n8n-nodes-base.gmail',
  'n8n-nodes-base.googleSheets',
  'n8n-nodes-base.googleDrive',
  'n8n-nodes-base.googleDocs',
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
  'n8n-nodes-base.hubspot',
  'n8n-nodes-base.pipedrive',
  'n8n-nodes-base.airtable',
  'n8n-nodes-base.mautic',
  'n8n-nodes-base.stripe',
  'n8n-nodes-base.quickbooks',
  'n8n-nodes-base.paddle',
  'n8n-nodes-base.wooCommerce',
  'n8n-nodes-base.shopify',
  'n8n-nodes-base.wordpress',
  'n8n-nodes-base.todoist',
  'n8n-nodes-base.trello',
  'n8n-nodes-base.merge',
]);

/** Build a set of all node names reachable from a given start node (main edges only) */
function reachableFrom(startName, connections) {
  const visited = new Set();
  const queue = [startName];
  while (queue.length) {
    const cur = queue.shift();
    if (visited.has(cur)) continue;
    visited.add(cur);
    const outEdges = (connections[cur]?.main || []).flat();
    for (const e of outEdges) queue.push(e.node);
  }
  return visited;
}

/** Return all node names that are true ancestors of a target (excludes the target itself) */
function ancestorsOf(targetName, connections) {
  const reverse = {};
  for (const [from, conn] of Object.entries(connections)) {
    for (const targets of (conn.main || [])) {
      for (const edge of (targets || [])) {
        (reverse[edge.node] ??= []).push(from);
      }
    }
  }
  const visited = new Set();
  const queue = [...(reverse[targetName] || [])]; // start from parents, not target itself
  while (queue.length) {
    const cur = queue.shift();
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const parent of (reverse[cur] || [])) queue.push(parent);
  }
  return visited;
}

function analyzeWorkflow(wf) {
  const gaps = [];
  const nodes = wf.nodes || [];
  const connections = wf.connections || {};

  // ── GAP-B: bogus errorWorkflow slug ────────────────────────────────────────
  const ew = wf.settings?.errorWorkflow;
  if (ew && !/^\d+$/.test(ew)) {
    gaps.push({ gap: 'B', detail: `settings.errorWorkflow="${ew}" is not a numeric n8n workflow ID` });
  }

  // ── GAP-A: responseNode webhook with unprotected path ──────────────────────
  const responseNodeWebhooks = nodes.filter(
    n => n.type === 'n8n-nodes-base.webhook' && n.parameters?.responseMode === 'responseNode'
  );

  for (const webhook of responseNodeWebhooks) {
    // Find all respondToWebhook nodes reachable from this webhook
    const reachable = reachableFrom(webhook.name, connections);

    const respondNodes = nodes.filter(
      n => RESPOND_TYPES.has(n.type) && reachable.has(n.name)
    );

    for (const respNode of respondNodes) {
      // Find all true ancestors of this respondToWebhook (excludes the node itself)
      const ancestors = ancestorsOf(respNode.name, connections);

      // Find critical nodes on the path that lack continueOnFail
      const unprotected = nodes.filter(n =>
        ancestors.has(n.name) &&
        n.name !== webhook.name &&        // exclude the trigger itself
        CRITICAL_TYPES.has(n.type) &&
        !n.continueOnFail
      );

      if (unprotected.length > 0) {
        gaps.push({
          gap: 'A',
          detail: `Webhook "${webhook.name}" → "${respNode.name}": ${unprotected.length} unprotected critical node(s): ${unprotected.map(n => n.name).join(', ')}`,
        });
      }
    }
  }

  // ── GAP-C: disconnected error handler nodes ─────────────────────────────────
  const errorNodes = nodes.filter(n =>
    /error.handler|error.check|errorhandler/i.test(n.name) ||
    (n.name.toLowerCase().includes('error') && !RESPOND_TYPES.has(n.type))
  );

  for (const en of errorNodes) {
    // Check: is this node reachable from any trigger?
    const triggers = nodes.filter(n =>
      n.type.includes('trigger') || n.type.includes('webhook') || n.type.includes('schedule')
    );
    let reachable = false;
    for (const trig of triggers) {
      if (reachableFrom(trig.name, connections).has(en.name)) {
        reachable = true;
        break;
      }
    }
    if (!reachable) {
      // Also check if it has any outgoing connections
      const hasOutgoing = (connections[en.name]?.main || []).flat().length > 0;
      gaps.push({
        gap: 'C',
        detail: `Node "${en.name}" (${en.type}) is not reachable from any trigger${hasOutgoing ? '' : ' and has no outgoing connections'}`,
      });
    }
  }

  return gaps;
}

async function main() {
  const client = await pool.connect();
  const { rows } = await client.query('SELECT id, name, workflow_json FROM templates ORDER BY id');

  const report = [];

  for (const row of rows) {
    const wf = row.workflow_json;
    if (!wf) continue;
    const gaps = analyzeWorkflow(wf);
    if (gaps.length) report.push({ id: row.id, name: row.name, gaps });
  }

  console.log(`\nScanned ${rows.length} workflows.\n`);

  if (report.length === 0) {
    console.log('✅ No error-handler gaps found.');
  } else {
    console.log(`⚠️  ${report.length} workflow(s) with gaps:\n`);
    for (const r of report) {
      console.log(`[${r.id}] ${r.name}`);
      for (const g of r.gaps) {
        const icon = g.gap === 'A' ? '🔴' : g.gap === 'B' ? '🟡' : '🟠';
        console.log(`  ${icon} GAP-${g.gap}: ${g.detail}`);
      }
      console.log();
    }

    const gapA = report.filter(r => r.gaps.some(g => g.gap === 'A'));
    const gapB = report.filter(r => r.gaps.some(g => g.gap === 'B'));
    const gapC = report.filter(r => r.gaps.some(g => g.gap === 'C'));

    console.log('=== TOTALS ===');
    console.log(`🔴 GAP-A (webhook hang risk)   : ${gapA.length} workflows  IDs: ${gapA.map(r=>r.id).join(',')}`);
    console.log(`🟡 GAP-B (bogus errorWorkflow)  : ${gapB.length} workflows  IDs: ${gapB.map(r=>r.id).join(',')}`);
    console.log(`🟠 GAP-C (dead error node)      : ${gapC.length} workflows  IDs: ${gapC.map(r=>r.id).join(',')}`);
  }

  client.release();
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
