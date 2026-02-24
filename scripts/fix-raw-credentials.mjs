/**
 * fix-raw-credentials.mjs
 * Fixes nodes whose credentials field contains a raw string instead of the
 * required { id, name } object format expected by n8n workflow templates.
 *
 * Converts:
 *   "mistralCloudApi": "{{ $credentials.mistralApi }}"
 *   "postgres": "devhubconnect-user-database"
 *   "slackApi": "My Slack Account"
 * To:
 *   "mistralCloudApi": { "id": "1", "name": "Mistral Api" }
 *   "postgres": { "id": "1", "name": "devhubconnect-user-database" }
 *   "slackApi": { "id": "1", "name": "My Slack Account" }
 *
 * Run:      node scripts/fix-raw-credentials.mjs
 * Dry-run:  node scripts/fix-raw-credentials.mjs --dry-run
 */

import pg from 'pg';
const { Pool } = pg;

const DRY_RUN = process.argv.includes('--dry-run');

const pool = new Pool({
  connectionString:
    'postgresql://postgres:atUkFxuogjjZODArPEnnbgUtSlZZswCe@ballast.proxy.rlwy.net:59419/railway',
});

/**
 * Convert a raw credential string to a human-readable name.
 * Handles:
 *   "{{ $credentials.mistralApi }}" → "Mistral Api"
 *   "devhubconnect-user-database"   → "devhubconnect-user-database"
 *   "My Slack Account"              → "My Slack Account"
 */
function deriveName(rawStr) {
  // Template expression: {{ $credentials.credentialName }}
  const tplMatch = rawStr.match(/\{\{\s*\$credentials\.([A-Za-z0-9_]+)\s*\}\}/);
  if (tplMatch) {
    // Convert camelCase → "Title Case"
    const camel = tplMatch[1];
    return camel
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, c => c.toUpperCase())
      .trim();
  }
  // Return as-is for human-readable or kebab-case names
  return rawStr;
}

/** Fix all raw string credentials in a workflow. Returns { changed, newWf, fixedCount } */
function fixWorkflow(wf) {
  const nodes = wf.nodes || [];
  let fixedCount = 0;

  const newNodes = nodes.map(node => {
    const creds = node.credentials;
    if (!creds) return node;

    let changed = false;
    const newCreds = {};

    for (const [credType, credVal] of Object.entries(creds)) {
      if (typeof credVal === 'string' && credVal.length > 0) {
        newCreds[credType] = { id: '1', name: deriveName(credVal) };
        fixedCount++;
        changed = true;
      } else {
        newCreds[credType] = credVal;
      }
    }

    if (!changed) return node;
    return { ...node, credentials: newCreds };
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

    let totalFixed = 0;
    let workflowsChanged = 0;

    for (const row of rows) {
      const { id, name, workflow_json: wf } = row;
      if (!wf) continue;

      const result = fixWorkflow(wf);
      if (!result.changed) continue;

      totalFixed += result.fixedCount;
      workflowsChanged++;
      console.log(`[${id}] ${name} — fixed ${result.fixedCount} credential(s)`);

      if (!DRY_RUN) {
        await client.query('UPDATE templates SET workflow_json = $1 WHERE id = $2', [
          JSON.stringify(result.newWf),
          id,
        ]);
      }
    }

    console.log('\n========== SUMMARY ==========');
    console.log(`Raw credentials fixed          : ${totalFixed}`);
    console.log(`Workflows updated              : ${workflowsChanged}`);
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
