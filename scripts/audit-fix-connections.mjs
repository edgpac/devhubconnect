/**
 * audit-fix-connections.mjs
 * Audits all 588 workflow JSONs in the DB for broken node connections
 * (where connection source/target names don't match any node.name in the workflow)
 * and automatically fixes them using fuzzy name matching.
 *
 * Run: node scripts/audit-fix-connections.mjs
 * Run dry-run: node scripts/audit-fix-connections.mjs --dry-run
 */

import pg from 'pg';
const { Pool } = pg;

const DRY_RUN = process.argv.includes('--dry-run');

const pool = new Pool({
  connectionString:
    'postgresql://postgres:atUkFxuogjjZODArPEnnbgUtSlZZswCe@ballast.proxy.rlwy.net:59419/railway',
});

// ---------- fuzzy matching ----------

/** Levenshtein distance between two strings (case-insensitive) */
function levenshtein(a, b) {
  a = a.toLowerCase();
  b = b.toLowerCase();
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

/** Similarity ratio 0-1 (1 = identical) */
function similarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/** Jaccard similarity on word tokens (case-insensitive) */
function wordJaccard(a, b) {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  let intersection = 0;
  for (const w of wordsA) if (wordsB.has(w)) intersection++;
  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

/**
 * Combined score: weighted blend that favors semantic word overlap.
 * Word Jaccard captures "same concept, different prefix" patterns.
 * Char similarity covers abbreviations and small renames.
 */
function combinedScore(a, b) {
  const wj = wordJaccard(a, b);
  const cs = similarity(a, b);
  // Word overlap counts double — prevents pure character alignment from winning
  // when the semantic words don't match
  return wj * 0.65 + cs * 0.35;
}

/**
 * Find the best matching node name from the set.
 * Returns { name, score } or null if no match above threshold.
 */
function bestMatch(target, nodeNames, threshold = 0.35) {
  let best = null;
  let bestScore = -1;

  for (const name of nodeNames) {
    const s = combinedScore(target, name);
    if (s > bestScore) {
      bestScore = s;
      best = name;
    }
  }

  return bestScore >= threshold ? { name: best, score: bestScore } : null;
}

// ---------- connection audit/fix ----------

function auditAndFix(wf) {
  const nodes = wf.nodes || [];
  const connections = wf.connections || {};
  const nodeNames = new Set(nodes.map((n) => n.name).filter(Boolean));

  // Build a rename map: oldName -> newName
  const renameMap = new Map();

  // Collect all bad names (source keys + target node values)
  const allBadNames = new Set();
  for (const srcName of Object.keys(connections)) {
    if (!nodeNames.has(srcName)) allBadNames.add(srcName);
    for (const branches of Object.values(connections[srcName])) {
      if (!Array.isArray(branches)) continue;
      for (const branch of branches) {
        if (!Array.isArray(branch)) continue; // null branch = empty output slot
        for (const conn of branch) {
          if (conn && conn.node && !nodeNames.has(conn.node)) allBadNames.add(conn.node);
        }
      }
    }
  }

  if (allBadNames.size === 0) return { changed: false, issues: [], fixed: [] };

  const issues = [];
  const fixed = [];
  const unfixable = [];

  for (const badName of allBadNames) {
    const match = bestMatch(badName, nodeNames);
    if (match) {
      renameMap.set(badName, match.name);
      fixed.push({ from: badName, to: match.name, score: match.score });
    } else {
      unfixable.push(badName);
      issues.push(`UNFIXABLE: '${badName}' (no close match among ${[...nodeNames].join(', ')})`);
    }
  }

  if (renameMap.size === 0) {
    return { changed: false, issues, fixed, unfixable };
  }

  // Apply renames to a deep-cloned connections object
  const newConnections = {};
  for (const [srcName, outputs] of Object.entries(connections)) {
    const newSrc = renameMap.get(srcName) ?? srcName;
    const newOutputs = {};
    for (const [outputType, branches] of Object.entries(outputs)) {
      if (!Array.isArray(branches)) {
        newOutputs[outputType] = branches;
        continue;
      }
      newOutputs[outputType] = branches.map((branch) => {
        if (!Array.isArray(branch)) return branch; // preserve null slots
        return branch.map((conn) =>
          conn ? { ...conn, node: renameMap.get(conn.node) ?? conn.node } : conn
        );
      });
    }
    // Merge: if newSrc already exists in newConnections, merge outputs
    if (newConnections[newSrc]) {
      for (const [ot, branches] of Object.entries(newOutputs)) {
        if (newConnections[newSrc][ot]) {
          newConnections[newSrc][ot] = [...newConnections[newSrc][ot], ...branches];
        } else {
          newConnections[newSrc][ot] = branches;
        }
      }
    } else {
      newConnections[newSrc] = newOutputs;
    }
  }

  const newWf = { ...wf, connections: newConnections };
  return { changed: true, newWf, issues, fixed, unfixable };
}

// ---------- fix invalid connection types (e.g. "error" port) ----------

const VALID_CONNECTION_TYPES = new Set([
  'main',
  'ai_chain', 'ai_document', 'ai_embedding', 'ai_languageModel',
  'ai_memory', 'ai_outputParser', 'ai_retriever', 'ai_textSplitter',
  'ai_tool', 'ai_vectorStore',
]);

/**
 * Finds connections keyed with invalid types (e.g. "error") and moves them
 * to main[1] (the error output branch). Also sets onError: "continueErrorOutput"
 * on the source node so n8n actually exposes that second output port.
 */
function fixInvalidConnectionTypes(wf) {
  const nodes = wf.nodes || [];
  const connections = wf.connections || {};
  const fixed = [];

  const newConnections = JSON.parse(JSON.stringify(connections)); // deep clone
  const newNodes = JSON.parse(JSON.stringify(nodes));

  for (const [srcName, outputs] of Object.entries(newConnections)) {
    const invalidTypes = Object.keys(outputs).filter(t => !VALID_CONNECTION_TYPES.has(t));
    if (invalidTypes.length === 0) continue;

    for (const badType of invalidTypes) {
      const branchesToMove = outputs[badType]; // array of branches
      delete newConnections[srcName][badType];

      // Ensure main exists; append error branches as main[1]
      if (!newConnections[srcName].main) newConnections[srcName].main = [[]];
      // main[0] = success, main[1] = error
      if (!newConnections[srcName].main[1]) {
        newConnections[srcName].main[1] = [];
      }
      // Move all targets from the invalid type into main[1]
      for (const branch of branchesToMove) {
        if (!Array.isArray(branch)) continue;
        for (const conn of branch) {
          if (conn) newConnections[srcName].main[1].push(conn);
        }
      }

      // Set onError on the source node so n8n renders the error output port
      const nodeIdx = newNodes.findIndex(n => n.name === srcName);
      if (nodeIdx !== -1 && !newNodes[nodeIdx].onError) {
        newNodes[nodeIdx].onError = 'continueErrorOutput';
      }

      fixed.push({ node: srcName, movedType: badType });
    }
  }

  if (fixed.length === 0) return { changed: false, fixed };

  const newWf = { ...wf, nodes: newNodes, connections: newConnections };
  return { changed: true, newWf, fixed };
}

// ---------- main ----------

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      'SELECT id, name, workflow_json FROM templates ORDER BY id'
    );

    console.log(`Loaded ${rows.length} workflows.\n`);

    let totalIssues = 0;
    let totalFixed = 0;
    let totalUnfixable = 0;
    let totalErrorPortFixed = 0;
    let workflowsUpdated = 0;
    const unfixableReport = [];

    for (const row of rows) {
      const { id, name, workflow_json: wf } = row;
      if (!wf) continue;

      // Pass 1: fix broken node name references (fuzzy match)
      const nameResult = auditAndFix(wf);
      // Pass 2: fix invalid connection types (e.g. "error" port → main[1])
      const errorPortResult = fixInvalidConnectionTypes(nameResult.newWf ?? wf);

      const anyChange = nameResult.changed || errorPortResult.changed;
      const issueCount = (nameResult.fixed?.length ?? 0) + (nameResult.unfixable?.length ?? 0) + (errorPortResult.fixed?.length ?? 0);
      if (issueCount === 0) continue;

      totalIssues += issueCount;
      totalFixed += nameResult.fixed?.length ?? 0;
      totalUnfixable += nameResult.unfixable?.length ?? 0;
      totalErrorPortFixed += errorPortResult.fixed?.length ?? 0;

      console.log(`[${id}] ${name}`);
      for (const f of nameResult.fixed ?? []) {
        console.log(`  FIXED (name)      : '${f.from}' -> '${f.to}' (score: ${f.score.toFixed(2)})`);
      }
      for (const u of nameResult.unfixable ?? []) {
        console.log(`  UNFIXABLE         : ${u}`);
        unfixableReport.push({ id, name, unfixable: u });
      }
      for (const f of errorPortResult.fixed ?? []) {
        console.log(`  FIXED (error port): node '${f.node}' — '${f.movedType}' → main[1] + onError`);
      }

      if (anyChange && !DRY_RUN) {
        const finalWf = errorPortResult.newWf ?? nameResult.newWf ?? wf;
        await client.query('UPDATE templates SET workflow_json = $1 WHERE id = $2', [
          JSON.stringify(finalWf),
          id,
        ]);
        workflowsUpdated++;
      }
    }

    console.log('\n========== SUMMARY ==========');
    console.log(`Total issues found                  : ${totalIssues}`);
    console.log(`Auto-fixed broken names             : ${totalFixed}`);
    console.log(`Auto-fixed invalid error ports      : ${totalErrorPortFixed}`);
    console.log(`Unfixable (no close match)          : ${totalUnfixable}`);
    console.log(`Workflows updated in DB             : ${DRY_RUN ? '(dry-run, 0)' : workflowsUpdated}`);

    if (unfixableReport.length > 0) {
      console.log('\n--- Unfixable connections ---');
      for (const u of unfixableReport) {
        console.log(`  [${u.id}] ${u.name}: '${u.unfixable}'`);
      }
    }

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
