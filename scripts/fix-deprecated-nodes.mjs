/**
 * fix-deprecated-nodes.mjs
 * Migrates deprecated n8n node types to their modern equivalents:
 *   n8n-nodes-base.function     → n8n-nodes-base.code      (typeVersion 2)
 *   n8n-nodes-base.functionItem → n8n-nodes-base.code      (typeVersion 2)
 *   n8n-nodes-base.emailTrigger → n8n-nodes-base.emailReadImap (typeVersion 1)
 *
 * Also renames the functionCode parameter → jsCode for function/functionItem nodes.
 *
 * Run:      node scripts/fix-deprecated-nodes.mjs
 * Dry-run:  node scripts/fix-deprecated-nodes.mjs --dry-run
 */

import pg from 'pg';
const { Pool } = pg;

const DRY_RUN = process.argv.includes('--dry-run');

const pool = new Pool({
  connectionString:
    'postgresql://postgres:atUkFxuogjjZODArPEnnbgUtSlZZswCe@ballast.proxy.rlwy.net:59419/railway',
});

function migrateNode(node) {
  const type = node.type;

  if (type === 'n8n-nodes-base.function' || type === 'n8n-nodes-base.functionItem') {
    const params = { ...(node.parameters || {}) };
    // Rename functionCode → jsCode
    if ('functionCode' in params) {
      params.jsCode = params.functionCode;
      delete params.functionCode;
    }
    return {
      ...node,
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      parameters: params,
    };
  }

  if (type === 'n8n-nodes-base.emailTrigger') {
    return {
      ...node,
      type: 'n8n-nodes-base.emailReadImap',
      typeVersion: 2,
    };
  }

  return node;
}

const DEPRECATED = new Set([
  'n8n-nodes-base.function',
  'n8n-nodes-base.functionItem',
  'n8n-nodes-base.emailTrigger',
]);

function fixWorkflow(wf) {
  const nodes = wf.nodes || [];
  let fixedCount = 0;

  const newNodes = nodes.map(node => {
    if (!DEPRECATED.has(node.type)) return node;
    fixedCount++;
    return migrateNode(node);
  });

  if (fixedCount === 0) return { changed: false };
  return { changed: true, newWf: { ...wf, nodes: newNodes }, fixedCount };
}

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      'SELECT id, name, workflow_json FROM templates ORDER BY id'
    );
    console.log(`Loaded ${rows.length} workflows.\n`);

    let totalNodes = 0;
    let workflowsChanged = 0;
    const changedIds = [];

    for (const row of rows) {
      const { id, name, workflow_json: wf } = row;
      if (!wf) continue;

      const result = fixWorkflow(wf);
      if (!result.changed) continue;

      totalNodes += result.fixedCount;
      workflowsChanged++;
      changedIds.push(id);
      console.log(`[${id}] ${name} — migrated ${result.fixedCount} node(s)`);

      if (!DRY_RUN) {
        await client.query('UPDATE templates SET workflow_json = $1 WHERE id = $2', [
          JSON.stringify(result.newWf),
          id,
        ]);
      }
    }

    console.log('\n========== SUMMARY ==========');
    console.log(`Deprecated nodes migrated : ${totalNodes}`);
    console.log(`Workflows updated         : ${workflowsChanged}`);
    if (changedIds.length) {
      console.log(`Workflow IDs              : ${changedIds.join(',')}`);
    }
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
