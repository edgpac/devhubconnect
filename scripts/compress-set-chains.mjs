/**
 * compress-set-chains.mjs
 * Merges consecutive Set→Set node pairs where the second node does not
 * reference the first node's output fields in its value expressions.
 *
 * Safe merge conditions:
 *   1. Both nodes are the same typeVersion (same parameter schema)
 *   2. Set B's parameter values do not reference $json.<field> where
 *      <field> was set by Set A (no cross-dependency)
 *
 * What changes in the merged node:
 *   - Keeps Set A's name, id, position
 *   - Combines assignments/values: Set A's fields first, then Set B's
 *   - Set A now connects directly to Set B's former outgoing targets
 *   - Set B is removed from the workflow
 *
 * Run:      node scripts/compress-set-chains.mjs
 * Dry-run:  node scripts/compress-set-chains.mjs --dry-run
 */

import pg from 'pg';
const { Pool } = pg;

const DRY_RUN = process.argv.includes('--dry-run');

const pool = new Pool({
  connectionString:
    'postgresql://postgres:atUkFxuogjjZODArPEnnbgUtSlZZswCe@ballast.proxy.rlwy.net:59419/railway',
});

// ---------- Set node helpers ----------

/** Return field names that a Set node writes to its output */
function getSetOutputFields(node) {
  const p = node.parameters || {};
  const fields = [];

  // v2/v3: parameters.assignments.assignments[].name
  const assignments = p.assignments?.assignments ?? p.assignments;
  if (Array.isArray(assignments)) {
    for (const a of assignments) {
      if (a?.name) fields.push(a.name);
    }
    return fields;
  }

  // v1: parameters.values.{ string, number, boolean, object, dateTime }[].name
  if (p.values && typeof p.values === 'object') {
    for (const arr of Object.values(p.values)) {
      if (!Array.isArray(arr)) continue;
      for (const item of arr) {
        if (item?.name) fields.push(item.name);
      }
    }
  }

  return fields;
}

/** Merge nodeB's parameters into nodeA's, returning the combined parameters */
function mergeSetParameters(nodeA, nodeB) {
  const pA = nodeA.parameters || {};
  const pB = nodeB.parameters || {};

  // v2/v3: assignments schema
  const asgA = pA.assignments?.assignments ?? pA.assignments;
  const asgB = pB.assignments?.assignments ?? pB.assignments;
  if (Array.isArray(asgA) && Array.isArray(asgB)) {
    // Deduplicate: if B sets a field that A also sets, B wins (B runs after A)
    const asgAFiltered = asgA.filter(
      (a) => !asgB.some((b) => b.name === a.name)
    );
    const merged = [...asgAFiltered, ...asgB];

    // Preserve the wrapper shape
    if (pA.assignments?.assignments !== undefined) {
      return { ...pB, assignments: { ...pB.assignments, assignments: merged } };
    }
    return { ...pB, assignments: merged };
  }

  // v1: values schema
  if (pA.values && pB.values) {
    const allKeys = new Set([
      ...Object.keys(pA.values),
      ...Object.keys(pB.values),
    ]);
    const mergedValues = {};
    for (const key of allKeys) {
      const arrA = pA.values[key] || [];
      const arrB = pB.values[key] || [];
      // B wins on field name conflicts
      const arrAFiltered = arrA.filter(
        (a) => !arrB.some((b) => b.name === a.name)
      );
      mergedValues[key] = [...arrAFiltered, ...arrB];
    }
    return {
      ...pB,
      values: mergedValues,
      // keepOnlySet: if either node drops unlisted fields, the merged node does too
      keepOnlySet: pA.keepOnlySet || pB.keepOnlySet || false,
    };
  }

  // Fallback: just use B's parameters (A had nothing meaningful)
  return pB;
}

/** Check whether nodeB's value expressions depend on any of nodeA's output fields */
function hasCrossReference(nodeA, nodeB) {
  const aFields = getSetOutputFields(nodeA);
  if (aFields.length === 0) return false;

  const bStr = JSON.stringify(nodeB.parameters || '');
  return aFields.some(
    (f) =>
      bStr.includes(`$json.${f}`) ||
      bStr.includes(`$json["${f}"]`) ||
      bStr.includes(`$json['${f}']`)
  );
}

// ---------- workflow-level merge ----------

function compressSetChains(wf) {
  const nodes = wf.nodes || [];
  const connections = wf.connections || {};

  // Build adjacency maps
  const outgoing = {}; // name → [{ node, type, index }]
  const incomingCount = {}; // name → count

  for (const [src, outputs] of Object.entries(connections)) {
    for (const branches of Object.values(outputs)) {
      if (!Array.isArray(branches)) continue;
      for (const branch of branches) {
        if (!Array.isArray(branch)) continue;
        for (const conn of branch) {
          if (!conn?.node) continue;
          if (!outgoing[src]) outgoing[src] = [];
          outgoing[src].push(conn.node);
          incomingCount[conn.node] = (incomingCount[conn.node] || 0) + 1;
        }
      }
    }
  }

  const nodeByName = {};
  for (const n of nodes) nodeByName[n.name] = n;

  const isSet = (n) => n?.type?.endsWith('.set');

  // Find all safe merge pairs (iterate until no more found — handles chains)
  const merged = []; // { fromName, intoName }
  let changed = true;

  // Work on a mutable copy of connections and node list
  let newConnections = JSON.parse(JSON.stringify(connections));
  let newNodes = JSON.parse(JSON.stringify(nodes));

  while (changed) {
    changed = false;

    // Rebuild maps on current state
    const curOut = {};
    const curInCount = {};
    for (const [src, outputs] of Object.entries(newConnections)) {
      for (const branches of Object.values(outputs)) {
        if (!Array.isArray(branches)) continue;
        for (const branch of branches) {
          if (!Array.isArray(branch)) continue;
          for (const conn of branch) {
            if (!conn?.node) continue;
            if (!curOut[src]) curOut[src] = [];
            curOut[src].push(conn.node);
            curInCount[conn.node] = (curInCount[conn.node] || 0) + 1;
          }
        }
      }
    }

    const curNodeByName = {};
    for (const n of newNodes) curNodeByName[n.name] = n;

    for (const nodeA of newNodes) {
      if (!isSet(nodeA)) continue;

      const outs = curOut[nodeA.name] || [];
      if (outs.length !== 1) continue; // A must have exactly 1 output

      const nodeBName = outs[0];
      const nodeB = curNodeByName[nodeBName];
      if (!nodeB || !isSet(nodeB)) continue;
      if ((curInCount[nodeBName] || 0) !== 1) continue; // B must have exactly 1 input
      if (nodeA.typeVersion !== nodeB.typeVersion) continue; // same schema version

      // Safety check
      if (hasCrossReference(nodeA, nodeB)) continue;

      // All clear — merge B into A
      const mergedParams = mergeSetParameters(nodeA, nodeB);

      // Update nodeA in place
      newNodes = newNodes.map((n) => {
        if (n.name !== nodeA.name) return n;
        return { ...n, parameters: mergedParams };
      });

      // Remove nodeB from nodes
      newNodes = newNodes.filter((n) => n.name !== nodeBName);

      // Re-wire connections: where nodeA → nodeB, replace with nodeA → nodeB's targets
      const newConns = JSON.parse(JSON.stringify(newConnections));

      // Find what B's outgoing connections are
      const bOutConns = newConns[nodeBName]; // { main: [[...]], ... }

      // Replace nodeA's single output branch with B's outputs
      for (const [outputType, branches] of Object.entries(newConns[nodeA.name] || {})) {
        if (!Array.isArray(branches)) continue;
        newConns[nodeA.name][outputType] = branches.map((branch) => {
          if (!Array.isArray(branch)) return branch;
          const newBranch = [];
          for (const conn of branch) {
            if (conn?.node === nodeBName) {
              // Replace this slot with B's downstream targets
              if (bOutConns) {
                for (const bBranches of Object.values(bOutConns)) {
                  if (!Array.isArray(bBranches)) continue;
                  for (const bBranch of bBranches) {
                    if (!Array.isArray(bBranch)) continue;
                    for (const bc of bBranch) {
                      if (bc) newBranch.push(bc);
                    }
                  }
                }
              }
            } else {
              newBranch.push(conn);
            }
          }
          return newBranch;
        });
      }

      // Remove nodeB's connection entry
      delete newConns[nodeBName];

      newConnections = newConns;
      merged.push({ into: nodeA.name, removed: nodeBName });
      changed = true;
      break; // Restart scan with updated state
    }
  }

  if (merged.length === 0) return { changed: false, merged: [] };

  const newWf = { ...wf, nodes: newNodes, connections: newConnections };
  return { changed: true, newWf, merged };
}

// ---------- main ----------

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      'SELECT id, name, workflow_json FROM templates ORDER BY id'
    );
    console.log(`Loaded ${rows.length} workflows.\n`);

    let totalMerged = 0;
    let workflowsChanged = 0;
    let totalSkipped = 0;

    for (const row of rows) {
      const { id, name, workflow_json: wf } = row;
      if (!wf) continue;

      const result = compressSetChains(wf);
      if (!result.changed) continue;

      totalMerged += result.merged.length;
      workflowsChanged++;

      console.log(`[${id}] ${name}`);
      for (const m of result.merged) {
        console.log(`  MERGED: '${m.removed}' into '${m.into}'`);
      }

      if (!DRY_RUN) {
        await client.query('UPDATE templates SET workflow_json = $1 WHERE id = $2', [
          JSON.stringify(result.newWf),
          id,
        ]);
      }
    }

    console.log('\n========== SUMMARY ==========');
    console.log(`Set nodes merged               : ${totalMerged}`);
    console.log(`Workflows compressed           : ${workflowsChanged}`);
    console.log(`Workflows updated in DB        : ${DRY_RUN ? '(dry-run, 0)' : workflowsChanged}`);

    if (DRY_RUN) {
      console.log('\n[DRY RUN] No changes written to DB. Remove --dry-run to apply.');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
