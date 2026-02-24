import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: 'postgresql://postgres:atUkFxuogjjZODArPEnnbgUtSlZZswCe@ballast.proxy.rlwy.net:59419/railway' });
const client = await pool.connect();
const { rows } = await client.query('SELECT id, name, workflow_json FROM templates ORDER BY id');

const results = {
  noopChains: [],
  setChains: [],
  largeCodeBlocks: [],
};

for (const row of rows) {
  const wf = row.workflow_json;
  if (!wf?.nodes) continue;
  const nodes = wf.nodes || [];
  const connections = wf.connections || {};

  const outgoing = {};
  const incoming = {};
  for (const [src, outputs] of Object.entries(connections)) {
    for (const branches of Object.values(outputs)) {
      if (!Array.isArray(branches)) continue;
      for (const branch of branches) {
        if (!Array.isArray(branch)) continue;
        for (const conn of branch) {
          if (!conn?.node) continue;
          if (!outgoing[src]) outgoing[src] = [];
          outgoing[src].push(conn.node);
          if (!incoming[conn.node]) incoming[conn.node] = [];
          incoming[conn.node].push(src);
        }
      }
    }
  }

  const nodeByName = {};
  for (const n of nodes) nodeByName[n.name] = n;

  // 1. NoOp pass-through nodes
  for (const n of nodes) {
    if (!n.type?.endsWith('.noOp')) continue;
    const inCount = (incoming[n.name] || []).length;
    const outCount = (outgoing[n.name] || []).length;
    if (inCount === 1 && outCount === 1) {
      results.noopChains.push({ id: row.id, wfName: row.name, nodeName: n.name });
    }
  }

  // 2. Set→Set chains
  const setType = n => n.type?.endsWith('.set');
  for (const n of nodes) {
    if (!setType(n)) continue;
    const outs = outgoing[n.name] || [];
    if (outs.length === 1) {
      const nextNode = nodeByName[outs[0]];
      if (nextNode && setType(nextNode)) {
        const nextIn = (incoming[nextNode.name] || []).length;
        if (nextIn === 1) {
          results.setChains.push({
            id: row.id, wfName: row.name,
            chain: n.name + ' → ' + nextNode.name
          });
        }
      }
    }
  }

  // 3. Large code node concentration
  const codeNodes = nodes.filter(n => n.type?.endsWith('.code'));
  if (codeNodes.length >= 5) {
    results.largeCodeBlocks.push({
      id: row.id, wfName: row.name,
      codeCount: codeNodes.length,
      totalNodes: nodes.length,
      pct: Math.round(codeNodes.length / nodes.length * 100),
      names: codeNodes.map(n => n.name).join(', ')
    });
  }
}

console.log('=== NoOp pass-through nodes (can be removed) ===');
const noopByWf = {};
for (const n of results.noopChains) {
  if (!noopByWf[n.id]) noopByWf[n.id] = { wfName: n.wfName, nodes: [] };
  noopByWf[n.id].nodes.push(n.nodeName);
}
for (const [id, info] of Object.entries(noopByWf)) {
  console.log('  [' + id + '] ' + info.wfName);
  console.log('    ' + info.nodes.join(', '));
}
console.log('Total removable NoOps: ' + results.noopChains.length);

console.log('\n=== Set→Set chains (can be merged) ===');
const setByWf = {};
for (const s of results.setChains) {
  if (!setByWf[s.id]) setByWf[s.id] = { wfName: s.wfName, chains: [] };
  setByWf[s.id].chains.push(s.chain);
}
for (const [id, info] of Object.entries(setByWf)) {
  console.log('  [' + id + '] ' + info.wfName);
  for (const c of info.chains) console.log('    ' + c);
}
console.log('Total mergeable Set pairs: ' + results.setChains.length);

console.log('\n=== High code node concentration ===');
results.largeCodeBlocks.sort((a,b) => b.pct - a.pct);
for (const r of results.largeCodeBlocks) {
  console.log('  [' + r.id + '] ' + r.codeCount + ' code/' + r.totalNodes + ' total (' + r.pct + '%) — ' + r.wfName);
}

client.release();
await pool.end();
