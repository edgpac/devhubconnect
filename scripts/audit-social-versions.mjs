import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: 'postgresql://postgres:atUkFxuogjjZODArPEnnbgUtSlZZswCe@ballast.proxy.rlwy.net:59419/railway' });
const client = await pool.connect();
const { rows } = await client.query('SELECT id, name, workflow_json FROM templates');

const KNOWN_MAX_VERSIONS = {
  'n8n-nodes-base.slack': 2,
  'n8n-nodes-base.telegram': 1,
  'n8n-nodes-base.telegramTrigger': 1,
  'n8n-nodes-base.whatsApp': 1,
  'n8n-nodes-base.whatsAppTrigger': 1,
  'n8n-nodes-base.discord': 2,
  'n8n-nodes-base.discordTrigger': 1,
  'n8n-nodes-base.reddit': 1,
  'n8n-nodes-base.twitter': 2,
  'n8n-nodes-base.linkedIn': 1,
  'n8n-nodes-base.youTube': 1,
  'n8n-nodes-base.facebookGraphApi': 1,
  'n8n-nodes-base.facebookLeadAdsTrigger': 1,
  'n8n-nodes-base.facebookPagesTrigger': 1,
};

const SOCIAL_TYPES = new Set(Object.keys(KNOWN_MAX_VERSIONS));
const versionMap = {};

for (const row of rows) {
  const wf = row.workflow_json;
  if (!wf || !wf.nodes) continue;
  for (const node of wf.nodes) {
    if (!SOCIAL_TYPES.has(node.type)) continue;
    const key = node.type + '@v' + node.typeVersion;
    if (!versionMap[key]) versionMap[key] = { type: node.type, version: node.typeVersion, count: 0, workflows: [] };
    versionMap[key].count++;
    if (!versionMap[key].workflows.includes(row.id)) versionMap[key].workflows.push(row.id);
  }
}

console.log('--- Social media node typeVersions ---');
for (const [key, info] of Object.entries(versionMap).sort()) {
  const maxV = KNOWN_MAX_VERSIONS[info.type];
  const flag = info.version > maxV ? ' WARNING VERSION TOO HIGH (max: ' + maxV + ')' : '';
  console.log(info.count + 'x  ' + key + flag + '  workflows: [' + info.workflows.join(',') + ']');
}

client.release();
await pool.end();
