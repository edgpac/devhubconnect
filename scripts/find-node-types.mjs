import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: 'postgresql://postgres:atUkFxuogjjZODArPEnnbgUtSlZZswCe@ballast.proxy.rlwy.net:59419/railway' });
const client = await pool.connect();

const { rows } = await client.query('SELECT id, workflow_json FROM templates');
console.log('Total rows:', rows.length);

const prefixCounts = {};
let totalNodes = 0;

for (const row of rows) {
  const wf = typeof row.workflow_json === 'string' ? JSON.parse(row.workflow_json) : row.workflow_json;
  if (!wf || !wf.nodes) continue;
  for (const node of wf.nodes) {
    const t = node.type;
    if (!t) continue;
    totalNodes++;
    // Extract prefix (everything before the first dot)
    const prefix = t.includes('.') ? t.split('.')[0] : t;
    prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1;
  }
}

console.log('Total nodes scanned:', totalNodes);
console.log('\nAll unique prefixes and their counts:');
const sorted = Object.entries(prefixCounts).sort((a, b) => b[1] - a[1]);
for (const [prefix, count] of sorted) {
  console.log(count + '\t' + prefix);
}

client.release();
await pool.end();
