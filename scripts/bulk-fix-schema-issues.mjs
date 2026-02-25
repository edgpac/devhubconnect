/**
 * bulk-fix-schema-issues.mjs
 * Fixes n8n schema issues that prevent workflows from loading:
 *
 *  1. DECIMAL_VERSION   — round decimal typeVersions to integer (except 1.1)
 *  2. RESPOND_*         — fix respondToWebhook: respondWith, responseCode, responseHeaders
 *  3. DEPRECATED_CRON   — migrate n8n-nodes-base.cron → scheduleTrigger
 *  4. WEBHOOK_FLAT_HDRS — remove flat responseHeaders from webhook options
 *
 * Run:      node scripts/bulk-fix-schema-issues.mjs
 * Dry-run:  node scripts/bulk-fix-schema-issues.mjs --dry-run
 */
import pg from 'pg';
const { Pool } = pg;

const DRY_RUN = process.argv.includes('--dry-run');

const pool = new Pool({
  connectionString: 'postgresql://postgres:atUkFxuogjjZODArPEnnbgUtSlZZswCe@ballast.proxy.rlwy.net:59419/railway',
});

function fixNode(n) {
  let node = { ...n };
  const fixes = [];

  // ── 1. Decimal typeVersion ───────────────────────────────────────────────
  const tv = node.typeVersion;
  if (typeof tv === 'number' && !Number.isInteger(tv) && tv !== 1.1) {
    const fixed = Math.floor(tv);
    node.typeVersion = fixed;
    fixes.push(`typeVersion ${tv}→${fixed}`);
  }

  // ── 2. Deprecated cron → scheduleTrigger ────────────────────────────────
  if (node.type === 'n8n-nodes-base.cron') {
    const expr = node.parameters?.expression || '0 0 * * *';
    node = {
      ...node,
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1,
      parameters: {
        rule: {
          interval: [{ field: 'cronExpression', expression: expr }],
        },
      },
    };
    fixes.push(`cron→scheduleTrigger`);
  }

  // ── 3. respondToWebhook fixes ────────────────────────────────────────────
  if (node.type === 'n8n-nodes-base.respondToWebhook') {
    // 3a. typeVersion: any decimal except 1.1 → 1.1
    if (node.typeVersion !== 1.1 && !Number.isInteger(node.typeVersion)) {
      node.typeVersion = 1.1;
      fixes.push(`typeVersion→1.1`);
    }

    const params = { ...node.parameters };
    const opts = { ...(params.options || {}) };

    // 3b. Integer responseCode → expression string
    if (typeof opts.responseCode === 'number') {
      opts.responseCode = `={{ ${opts.responseCode} }}`;
      fixes.push(`responseCode→expression`);
    }

    // 3c. Flat responseHeaders → entries array
    if (opts.responseHeaders && !opts.responseHeaders.entries) {
      const entries = Object.entries(opts.responseHeaders).map(([name, value]) => ({ name, value }));
      opts.responseHeaders = { entries };
      fixes.push(`responseHeaders→entries`);
    }

    // 3d. Missing respondWith → default to "json"
    if (!params.respondWith) {
      params.respondWith = 'json';
      fixes.push(`+respondWith:json`);
    }

    // 3e. Missing responseBody when respondWith is json
    if (params.respondWith === 'json' && !params.responseBody) {
      params.responseBody = '={{ JSON.stringify($json, null, 2) }}';
      fixes.push(`+responseBody`);
    }

    params.options = opts;
    node.parameters = params;
  }

  // ── 4. Webhook: flat responseHeaders in options ──────────────────────────
  if (node.type === 'n8n-nodes-base.webhook') {
    const params = { ...node.parameters };
    const opts = { ...(params.options || {}) };
    if (opts.responseHeaders && !opts.responseHeaders.entries) {
      const { responseHeaders, ...restOpts } = opts;
      params.options = restOpts;
      node.parameters = params;
      fixes.push(`webhook options.responseHeaders removed`);
    }
  }

  return { node, fixes };
}

function fixWorkflow(wf) {
  const allFixes = {};
  let changed = false;

  wf.nodes = wf.nodes.map(n => {
    const { node, fixes } = fixNode(n);
    if (fixes.length) {
      allFixes[n.name] = fixes;
      changed = true;
    }
    return node;
  });

  return { changed, allFixes };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const client = await pool.connect();
const { rows } = await client.query('SELECT id, name, workflow_json FROM templates ORDER BY id');
console.log(`Loaded ${rows.length} workflows.\n`);

let wfsChanged = 0;
const counts = { DECIMAL_VERSION: 0, CRON: 0, RESPOND: 0, WEBHOOK_HDRS: 0 };

for (const row of rows) {
  const { id, name, workflow_json: wf } = row;
  if (!wf || !Array.isArray(wf.nodes)) continue;

  const { changed, allFixes } = fixWorkflow(wf);
  if (!changed) continue;

  wfsChanged++;
  console.log(`[${id}] ${name}`);
  for (const [nodeName, fixes] of Object.entries(allFixes)) {
    console.log(`  ${nodeName}: ${fixes.join(', ')}`);
    for (const f of fixes) {
      if (f.startsWith('typeVersion') || f.includes('→')) counts.DECIMAL_VERSION++;
      if (f.includes('cron')) counts.CRON++;
      if (f.includes('respondWith') || f.includes('responseCode') || f.includes('responseBody') || f.includes('responseHeaders→')) counts.RESPOND++;
      if (f.includes('webhook options')) counts.WEBHOOK_HDRS++;
    }
  }

  if (!DRY_RUN) {
    await client.query('UPDATE templates SET workflow_json = $1 WHERE id = $2', [JSON.stringify(wf), id]);
  }
}

console.log('\n════════════════════════════════════════');
console.log('SUMMARY');
console.log(`  Workflows updated : ${wfsChanged}`);
console.log(`  Decimal typeVersions fixed : ${counts.DECIMAL_VERSION}`);
console.log(`  Cron→scheduleTrigger       : ${counts.CRON}`);
console.log(`  respondToWebhook fixes     : ${counts.RESPOND}`);
console.log(`  Webhook flat headers       : ${counts.WEBHOOK_HDRS}`);
if (DRY_RUN) console.log('\n[DRY RUN] No changes written. Remove --dry-run to apply.');

client.release();
await pool.end();
