import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: 'postgresql://postgres:atUkFxuogjjZODArPEnnbgUtSlZZswCe@ballast.proxy.rlwy.net:59419/railway' });
const client = await pool.connect();
const { rows } = await client.query('SELECT id, name, workflow_json FROM templates');

// Broad LLM pattern
const LLM_TYPES = /langchain\.(lmChat|lmOpenAi|lmCohere|openAi)|n8n-nodes-base\.openAi/;

const inventory = {};

for (const row of rows) {
  const wf = row.workflow_json;
  if (!wf?.nodes) continue;
  for (const node of wf.nodes) {
    const t = node.type || '';
    if (!LLM_TYPES.test(t)) continue;
    if (!inventory[t]) inventory[t] = { count: 0, models: {}, workflows: [], sample: null };
    inventory[t].count++;
    if (!inventory[t].workflows.includes(row.id)) inventory[t].workflows.push(row.id);

    // Capture sample of full parameters (first occurrence only)
    if (!inventory[t].sample) {
      inventory[t].sample = JSON.stringify({ parameters: node.parameters, credentials: node.credentials, typeVersion: node.typeVersion }, null, 2);
    }

    // Try multiple paths to find model
    const p = node.parameters || {};
    const model = p.model?.value ?? p.model ?? p.modelId?.value ?? p.modelId ?? p.options?.model ?? 'unknown';
    const modelStr = typeof model === 'string' ? model : JSON.stringify(model);
    inventory[t].models[modelStr] = (inventory[t].models[modelStr] || 0) + 1;
  }
}

for (const [type, info] of Object.entries(inventory).sort()) {
  console.log('\n=== ' + info.count + 'x  ' + type + ' ===');
  console.log('workflows: [' + info.workflows.join(',') + ']');
  console.log('models:');
  for (const [m, c] of Object.entries(info.models)) console.log('  ' + c + 'x  ' + m);
  console.log('--- sample params ---');
  console.log(info.sample);
}

client.release();
await pool.end();
