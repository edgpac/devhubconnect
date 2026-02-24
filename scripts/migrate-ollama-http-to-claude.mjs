/**
 * migrate-ollama-http-to-claude.mjs
 * Converts direct Ollama HTTP Request nodes (localhost:11434) to call the
 * Anthropic Claude API, and updates downstream response field references.
 *
 * Affected workflows: 675, 676, 677, 681
 *
 * Transformations:
 *   HTTP Request nodes:
 *     URL    : Ollama endpoint → https://api.anthropic.com/v1/messages
 *     Headers: + x-api-key, + anthropic-version
 *     Body   : { model, prompt, stream } → { model, max_tokens, messages[{role,content}] }
 *
 *   Code nodes (workflow 681):
 *     Rewrites the Ollama fetch block to use Anthropic fetch
 *
 *   Downstream Set nodes:
 *     $json.response fallback chain gets $json.content?.[0]?.text prepended
 *
 *   Downstream Code nodes:
 *     .response → .content?.[0]?.text
 *
 * Run:      node scripts/migrate-ollama-http-to-claude.mjs
 * Dry-run:  node scripts/migrate-ollama-http-to-claude.mjs --dry-run
 */

import pg from 'pg';
const { Pool } = pg;

const DRY_RUN = process.argv.includes('--dry-run');

const pool = new Pool({
  connectionString:
    'postgresql://postgres:atUkFxuogjjZODArPEnnbgUtSlZZswCe@ballast.proxy.rlwy.net:59419/railway',
});

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-4-6';
const CLAUDE_MAX_TOKENS = 2048;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Given an Ollama-style jsonBody expression string, extract the prompt
 * content and rebuild as a Claude messages-format body.
 *
 * Input:  ={\n  "model": "...",\n  "prompt": "TEXT",\n  "stream": false\n}
 * Output: ={\n  "model": "claude-sonnet-4-6",\n  "max_tokens": 2048,\n
 *           "messages": [{"role": "user", "content": "TEXT"}]\n}
 */
function convertOllamaBodyToClaudeBody(jsonBody) {
  if (!jsonBody || typeof jsonBody !== 'string') return jsonBody;

  // Parse out the prompt value — it may span multiple lines.
  // The JSON is an n8n expression (may start with =), so we work on the raw string.
  const isExpr = jsonBody.startsWith('=');
  const raw = isExpr ? jsonBody.slice(1) : jsonBody;

  // Try to find the "prompt" key and extract its value
  // Strategy: find "prompt": " ... " accounting for escaped chars and n8n {{ }} expressions.
  // The prompt value ends at the last " before \n  "stream" or \n  "options" or end of object.
  const promptMatch = raw.match(/"prompt"\s*:\s*"([\s\S]*?)(?=",\s*\n\s*"(?:stream|options)|\"\s*\n\s*\})/);
  if (!promptMatch) {
    console.warn('  Could not extract prompt from body — skipping body transform');
    return jsonBody;
  }

  const promptContent = promptMatch[1]; // already escaped for JSON string

  const newBody = `{
  "model": "${CLAUDE_MODEL}",
  "max_tokens": ${CLAUDE_MAX_TOKENS},
  "messages": [{"role": "user", "content": "${promptContent}"}]
}`;

  return isExpr ? `=${newBody}` : newBody;
}

/**
 * Update HTTP Request node parameters to call Claude instead of Ollama.
 */
function migrateHttpRequestNode(node) {
  const p = JSON.parse(JSON.stringify(node.parameters || {}));

  // Update URL
  p.url = CLAUDE_API_URL;

  // Update body
  if (p.jsonBody) {
    p.jsonBody = convertOllamaBodyToClaudeBody(p.jsonBody);
  }

  // Update headers — add x-api-key and anthropic-version
  if (!p.headerParameters) p.headerParameters = { parameters: [] };
  const headers = p.headerParameters.parameters || [];

  // Remove or update existing Content-Type (keep it)
  const filtered = headers.filter(h =>
    !['x-api-key', 'anthropic-version'].includes(h.name?.toLowerCase())
  );
  filtered.push({ name: 'x-api-key', value: '={{ $env.ANTHROPIC_API_KEY }}' });
  filtered.push({ name: 'anthropic-version', value: '2023-06-01' });
  p.headerParameters.parameters = filtered;

  return { ...node, parameters: p };
}

/**
 * Update a Code node that calls Ollama — replace the fetch block with Anthropic fetch.
 * Looks for the pattern: fetch(llmEndpoint, { method: 'POST', body: JSON.stringify({...prompt...}) })
 */
function migrateCodeNode(node) {
  const p = JSON.parse(JSON.stringify(node.parameters || {}));
  let code = p.jsCode || '';

  if (!code.includes('11434') && !code.includes('localhost') && !code.includes('generate')) {
    return node; // nothing to change
  }

  // Replace the entire LLM request block
  // Pattern: const llmEndpoint = ...; const model = ...; ... fetch(llmEndpoint, ...)
  // Replace with a Claude API call
  code = code.replace(
    /const llmEndpoint\s*=[\s\S]*?const response\s*=\s*await\s+fetch\([\s\S]*?body:\s*JSON\.stringify\(\{[\s\S]*?\}\)\s*\}\s*\);/,
    `const claudeApiKey = $env.ANTHROPIC_API_KEY;
  const claudeUrl = '${CLAUDE_API_URL}';

  const response = await fetch(claudeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': claudeApiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: '${CLAUDE_MODEL}',
      max_tokens: ${CLAUDE_MAX_TOKENS},
      messages: [{ role: 'user', content: prompt }]
    })
  });`
  );

  // Update response parsing: data.response → data.content[0].text
  code = code.replace(/data\.response\b/g, 'data.content[0].text');
  code = code.replace(/llmResponse\.response\b/g, 'llmResponse.content[0].text');
  code = code.replace(/result\.response\b/g, 'result.content[0].text');

  p.jsCode = code;
  return { ...node, parameters: p };
}

/**
 * Update downstream Set node value expressions to include Claude response path.
 * $json.response → $json.content?.[0]?.text || $json.response
 */
function migrateSetNode(node) {
  const p = JSON.parse(JSON.stringify(node.parameters || {}));
  const pStr = JSON.stringify(p);

  // Only update if it references $json.response in a fallback chain
  if (!pStr.includes('$json.response')) return node;

  // Replace $json.response with $json.content?.[0]?.text || $json.response
  // But don't double-add if already updated
  const updated = pStr.replace(
    /\$json\.response(?!\s*\|\|\s*\$json\.content)/g,
    '$json.content?.[0]?.text || $json.response'
  );

  if (updated === pStr) return node;
  return { ...node, parameters: JSON.parse(updated) };
}

/**
 * Update downstream Code node to use .content?.[0]?.text instead of .response
 */
function migrateDownstreamCodeNode(node) {
  const p = JSON.parse(JSON.stringify(node.parameters || {}));
  let code = p.jsCode || '';

  if (!code.includes('.response')) return node;

  // Don't modify the AI analysis code node itself (handled separately)
  if (code.includes('11434') || code.includes('localhost') || code.includes('generate')) return node;

  // Replace response field access patterns (careful not to break other .response usages)
  // Only replace patterns like: aiResult.response, llmData.response, analysisResult.response
  const updated = code
    .replace(/\baiResult\.response\b/g, '(aiResult.content?.[0]?.text || aiResult.response)')
    .replace(/\bllmData\.response\b/g, '(llmData.content?.[0]?.text || llmData.response)')
    .replace(/\banalysisResult\.response\b/g, '(analysisResult.content?.[0]?.text || analysisResult.response)')
    .replace(/\baiResponse\.response\b/g, '(aiResponse.content?.[0]?.text || aiResponse.response)')
    .replace(/\bllmResponse\.response\b/g, '(llmResponse.content?.[0]?.text || llmResponse.response)');

  if (updated === code) return node;
  p.jsCode = updated;
  return { ...node, parameters: p };
}

function isOllamaHttpNode(node) {
  const p = JSON.stringify(node.parameters || {});
  return (
    node.type === 'n8n-nodes-base.httpRequest' &&
    (p.includes('11434') || p.includes('localhost:11434') ||
     (p.includes('LOCAL_LLM_URL') && p.includes('generate')))
  );
}

function isOllamaCodeNode(node) {
  const p = JSON.stringify(node.parameters || {});
  return (
    node.type === 'n8n-nodes-base.code' &&
    (p.includes('11434') || (p.includes('localhost') && p.includes('generate')))
  );
}

// ─── BFS to find all downstream nodes ─────────────────────────────────────────

function downstreamFrom(startName, connections) {
  const visited = new Set();
  const queue = [startName];
  while (queue.length) {
    const cur = queue.shift();
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const branches of Object.values(connections[cur] || {})) {
      for (const branch of (branches || [])) {
        for (const c of (branch || [])) {
          if (c?.node) queue.push(c.node);
        }
      }
    }
  }
  visited.delete(startName);
  return visited;
}

// ─── Per-workflow migration ────────────────────────────────────────────────────

function migrateWorkflow(wf) {
  const nodes = wf.nodes || [];
  const connections = wf.connections || {};
  let changed = false;
  const log = [];

  const newNodes = nodes.map(node => {
    // Migrate Ollama HTTP Request nodes
    if (isOllamaHttpNode(node)) {
      log.push(`  MIGRATED HTTP node '${node.name}' → Claude API`);
      changed = true;
      return migrateHttpRequestNode(node);
    }

    // Migrate Ollama Code nodes
    if (isOllamaCodeNode(node)) {
      const updated = migrateCodeNode(node);
      if (JSON.stringify(updated) !== JSON.stringify(node)) {
        log.push(`  MIGRATED Code node '${node.name}' → Claude API`);
        changed = true;
        return updated;
      }
    }

    return node;
  });

  if (!changed) return { changed: false };

  // Find all AI node names and their downstream nodes
  const aiNodeNames = new Set(
    nodes.filter(n => isOllamaHttpNode(n) || isOllamaCodeNode(n)).map(n => n.name)
  );

  const downstreamNames = new Set();
  for (const name of aiNodeNames) {
    for (const d of downstreamFrom(name, connections)) downstreamNames.add(d);
  }

  // Update downstream nodes
  const finalNodes = newNodes.map(node => {
    if (!downstreamNames.has(node.name)) return node;

    if (node.type === 'n8n-nodes-base.set') {
      const updated = migrateSetNode(node);
      if (JSON.stringify(updated) !== JSON.stringify(node)) {
        log.push(`  UPDATED Set node '${node.name}' → added content[0].text fallback`);
        changed = true;
        return updated;
      }
    }

    if (node.type === 'n8n-nodes-base.code') {
      const updated = migrateDownstreamCodeNode(node);
      if (JSON.stringify(updated) !== JSON.stringify(node)) {
        log.push(`  UPDATED Code node '${node.name}' → updated .response access`);
        changed = true;
        return updated;
      }
    }

    return node;
  });

  return { changed, newWf: { ...wf, nodes: finalNodes }, log };
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      'SELECT id, name, workflow_json FROM templates WHERE id IN (675, 676, 677, 681) ORDER BY id'
    );
    console.log(`Loaded ${rows.length} workflows.\n`);

    let workflowsChanged = 0;

    for (const row of rows) {
      const { id, name, workflow_json: wf } = row;
      if (!wf) continue;

      const result = migrateWorkflow(wf);
      if (!result.changed) { console.log(`[${id}] ${name} — no changes`); continue; }

      workflowsChanged++;
      console.log(`[${id}] ${name}`);
      for (const l of result.log) console.log(l);

      if (!DRY_RUN) {
        await client.query('UPDATE templates SET workflow_json = $1 WHERE id = $2', [
          JSON.stringify(result.newWf),
          id,
        ]);
      }
    }

    console.log('\n========== SUMMARY ==========');
    console.log(`Workflows migrated to Claude   : ${workflowsChanged}`);
    console.log(`DB updated                     : ${DRY_RUN ? '(dry-run, 0)' : workflowsChanged}`);

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
