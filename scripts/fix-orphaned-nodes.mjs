/**
 * fix-orphaned-nodes.mjs
 * Removes nodes that are unreachable from any trigger via the main execution
 * graph, and cleans up the dangling connection entries they leave behind.
 *
 * Safe conditions for removal:
 *   - Node is NOT a trigger (TRIGGER_TYPES)
 *   - Node is NOT a LangChain sub-node (attaches via ai_* port — normal to be
 *     "unreachable" from main BFS, handled correctly by n8n)
 *   - Node is NOT a sticky note annotation
 *   - Node has NO path from any trigger via the main execution graph
 *
 * Run:      node scripts/fix-orphaned-nodes.mjs
 * Dry-run:  node scripts/fix-orphaned-nodes.mjs --dry-run
 */

import pg from 'pg';
const { Pool } = pg;

const DRY_RUN = process.argv.includes('--dry-run');

const pool = new Pool({
  connectionString:
    'postgresql://postgres:atUkFxuogjjZODArPEnnbgUtSlZZswCe@ballast.proxy.rlwy.net:59419/railway',
});

// ─── Classification sets (kept in sync with marketplace-audit.mjs) ────────────

const TRIGGER_TYPES = new Set([
  'n8n-nodes-base.webhook', 'n8n-nodes-base.webhookTrigger',
  'n8n-nodes-base.scheduleTrigger', 'n8n-nodes-base.cron',
  'n8n-nodes-base.manualTrigger', 'n8n-nodes-base.n8nTrigger',
  'n8n-nodes-base.executeWorkflowTrigger',
  'n8n-nodes-base.gmailTrigger', 'n8n-nodes-base.telegramTrigger',
  'n8n-nodes-base.slackTrigger', 'n8n-nodes-base.discordTrigger',
  'n8n-nodes-base.whatsAppTrigger', 'n8n-nodes-base.microsoftTeamsTrigger',
  'n8n-nodes-base.facebookLeadAdsTrigger', 'n8n-nodes-base.facebookPagesTrigger',
  'n8n-nodes-base.githubTrigger', 'n8n-nodes-base.gitlabTrigger',
  'n8n-nodes-base.jiraTrigger', 'n8n-nodes-base.linearTrigger',
  'n8n-nodes-base.trelloTrigger', 'n8n-nodes-base.asanaTrigger',
  'n8n-nodes-base.notionTrigger', 'n8n-nodes-base.hubspotTrigger',
  'n8n-nodes-base.salesforceTrigger', 'n8n-nodes-base.pipedriveTrigger',
  'n8n-nodes-base.stripeTrigger', 'n8n-nodes-base.paypalTrigger',
  'n8n-nodes-base.payPalTrigger', 'n8n-nodes-base.shopifyTrigger',
  'n8n-nodes-base.wooCommerceTrigger', 'n8n-nodes-base.gumroadTrigger',
  'n8n-nodes-base.googleDriveTrigger', 'n8n-nodes-base.googleSheetsTrigger',
  'n8n-nodes-base.mqttTrigger', 'n8n-nodes-base.rabbitmqTrigger',
  'n8n-nodes-base.redisTrigger', 'n8n-nodes-base.amqpTrigger',
  'n8n-nodes-base.sseClientTrigger', 'n8n-nodes-base.localFileTrigger',
  'n8n-nodes-base.rssFeedReadTrigger', 'n8n-nodes-base.chatTrigger',
  'n8n-nodes-base.calTrigger', 'n8n-nodes-base.errorTrigger',
  'n8n-nodes-base.executionDataTrigger', 'n8n-nodes-base.postmarkTrigger',
  'n8n-nodes-base.stravaTrigger', 'n8n-nodes-base.invoiceNinjaTrigger',
  'n8n-nodes-base.webflowTrigger', 'n8n-nodes-base.formTrigger',
  'n8n-nodes-base.typeformTrigger', 'n8n-nodes-base.emailReadImap',
  'n8n-nodes-base.emailTrigger', 'n8n-nodes-base.mailchimpTrigger',
  'n8n-nodes-base.mailjetTrigger',
  '@n8n/n8n-nodes-langchain.chatTrigger',
  '@n8n/n8n-nodes-langchain.mcpTrigger',
  'n8n-nodes-base.respondToWebhook',
]);

const ANNOTATION_TYPES = new Set(['n8n-nodes-base.stickyNote']);

function isLangchainSub(type) {
  if (type.startsWith('@n8n/n8n-nodes-langchain.')) return true;
  if (type.endsWith('Tool')) return true;
  return false;
}

// ─── Core logic ───────────────────────────────────────────────────────────────

function reachableFrom(startName, outgoing) {
  const visited = new Set();
  const queue = [startName];
  while (queue.length) {
    const cur = queue.shift();
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const next of (outgoing[cur] || [])) queue.push(next);
  }
  return visited;
}

function removeOrphans(wf) {
  const nodes = wf.nodes || [];
  const connections = wf.connections || {};

  if (nodes.length === 0) return { changed: false };

  // Build main-execution outgoing adjacency map
  const outgoing = {};
  for (const [src, outputs] of Object.entries(connections)) {
    for (const branches of Object.values(outputs)) {
      if (!Array.isArray(branches)) continue;
      for (const branch of branches) {
        if (!Array.isArray(branch)) continue;
        for (const conn of branch) {
          if (!conn?.node) continue;
          if (!outgoing[src]) outgoing[src] = new Set();
          outgoing[src].add(conn.node);
        }
      }
    }
  }

  // Find all reachable node names from any trigger
  const triggerNodes = nodes.filter(n => TRIGGER_TYPES.has(n.type));
  const allReachable = new Set();
  for (const t of triggerNodes) {
    for (const n of reachableFrom(t.name, outgoing)) allReachable.add(n);
    allReachable.add(t.name);
  }

  if (triggerNodes.length === 0) return { changed: false };

  // Find orphaned nodes to remove
  const orphanNames = new Set();
  for (const node of nodes) {
    if (ANNOTATION_TYPES.has(node.type)) continue;
    if (isLangchainSub(node.type)) continue;
    if (TRIGGER_TYPES.has(node.type)) continue;
    if (!allReachable.has(node.name)) {
      orphanNames.add(node.name);
    }
  }

  if (orphanNames.size === 0) return { changed: false };

  // Remove orphaned nodes from nodes array
  const newNodes = nodes.filter(n => !orphanNames.has(n.name));

  // Remove orphaned nodes from connections (as source AND as target)
  const newConnections = {};
  for (const [src, outputs] of Object.entries(connections)) {
    if (orphanNames.has(src)) continue; // drop entire source entry

    const cleanedOutputs = {};
    for (const [portType, branches] of Object.entries(outputs)) {
      if (!Array.isArray(branches)) {
        cleanedOutputs[portType] = branches;
        continue;
      }
      const cleanedBranches = branches.map(branch => {
        if (!Array.isArray(branch)) return branch;
        return branch.filter(conn => conn?.node && !orphanNames.has(conn.node));
      });
      cleanedOutputs[portType] = cleanedBranches;
    }
    newConnections[src] = cleanedOutputs;
  }

  const removed = [...orphanNames];
  return {
    changed: true,
    newWf: { ...wf, nodes: newNodes, connections: newConnections },
    removed,
  };
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      'SELECT id, name, workflow_json FROM templates ORDER BY id'
    );
    console.log(`Loaded ${rows.length} workflows.\n`);

    let totalRemoved = 0;
    let workflowsChanged = 0;

    for (const row of rows) {
      const { id, name, workflow_json: wf } = row;
      if (!wf) continue;

      const result = removeOrphans(wf);
      if (!result.changed) continue;

      totalRemoved += result.removed.length;
      workflowsChanged++;

      console.log(`[${id}] ${name}`);
      for (const n of result.removed) {
        console.log(`  REMOVED: '${n}'`);
      }

      if (!DRY_RUN) {
        await client.query('UPDATE templates SET workflow_json = $1 WHERE id = $2', [
          JSON.stringify(result.newWf),
          id,
        ]);
      }
    }

    console.log('\n========== SUMMARY ==========');
    console.log(`Orphaned nodes removed         : ${totalRemoved}`);
    console.log(`Workflows cleaned              : ${workflowsChanged}`);
    console.log(`Workflows updated in DB        : ${DRY_RUN ? '(dry-run, 0)' : workflowsChanged}`);

    if (DRY_RUN) {
      console.log('\n[DRY RUN] No changes written to DB. Remove --dry-run to apply.');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
