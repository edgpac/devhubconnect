/**
 * scan-schema-issues.mjs
 * Scans all templates for n8n schema issues that prevent workflows from loading:
 *  - Decimal typeVersions (except 1.1 which is valid for respondToWebhook)
 *  - respondToWebhook: flat responseHeaders, integer responseCode, missing respondWith
 *  - Webhook: responseHeaders in options (flat object)
 *  - Deprecated cron node type
 */
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:atUkFxuogjjZODArPEnnbgUtSlZZswCe@ballast.proxy.rlwy.net:59419/railway',
});

const client = await pool.connect();
const { rows } = await client.query('SELECT id, name, workflow_json FROM templates ORDER BY id');

const issues = [];

for (const row of rows) {
  const wf = row.workflow_json;
  if (!wf || !Array.isArray(wf.nodes)) continue;

  const nodeIssues = [];

  for (const n of wf.nodes) {
    const tv = n.typeVersion;

    // 1. Invalid decimal typeVersions (anything decimal except 1.1)
    if (typeof tv === 'number' && !Number.isInteger(tv) && tv !== 1.1) {
      nodeIssues.push(`DECIMAL_VERSION: "${n.name}" (${n.type}) v${tv}`);
    }

    // 2. Deprecated cron node
    if (n.type === 'n8n-nodes-base.cron') {
      nodeIssues.push(`DEPRECATED_CRON: "${n.name}"`);
    }

    // 3. respondToWebhook issues
    if (n.type === 'n8n-nodes-base.respondToWebhook') {
      const opts = n.parameters?.options || {};

      // Flat responseHeaders (not entries array)
      if (opts.responseHeaders && !opts.responseHeaders.entries) {
        nodeIssues.push(`RESPOND_FLAT_HEADERS: "${n.name}" responseHeaders is flat object`);
      }

      // Integer responseCode
      if (typeof opts.responseCode === 'number') {
        nodeIssues.push(`RESPOND_INT_CODE: "${n.name}" responseCode=${opts.responseCode} is integer`);
      }

      // Missing respondWith
      if (!n.parameters?.respondWith) {
        nodeIssues.push(`RESPOND_MISSING_RESPONDWITH: "${n.name}"`);
      }
    }

    // 4. Webhook node with flat responseHeaders in options
    if (n.type === 'n8n-nodes-base.webhook') {
      const opts = n.parameters?.options || {};
      if (opts.responseHeaders && !opts.responseHeaders.entries) {
        nodeIssues.push(`WEBHOOK_FLAT_HEADERS: "${n.name}" options.responseHeaders is flat object`);
      }
    }
  }

  if (nodeIssues.length) {
    issues.push({ id: row.id, name: row.name, issues: nodeIssues });
  }
}

console.log(`\nScanned ${rows.length} workflows.\n`);

if (issues.length === 0) {
  console.log('✅ No schema issues found.');
} else {
  console.log(`⚠️  ${issues.length} workflow(s) with issues:\n`);
  for (const r of issues) {
    console.log(`[${r.id}] ${r.name}`);
    for (const i of r.issues) console.log(`  → ${i}`);
    console.log();
  }

  // Summary by type
  const counts = {};
  for (const r of issues) {
    for (const i of r.issues) {
      const key = i.split(':')[0];
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  console.log('=== ISSUE TOTALS ===');
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
}

client.release();
await pool.end();
