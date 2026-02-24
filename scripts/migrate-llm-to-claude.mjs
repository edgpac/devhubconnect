/**
 * migrate-llm-to-claude.mjs
 * Migrates all LangChain LLM backbone nodes to Anthropic Claude (claude-sonnet-4-6).
 *
 * Nodes replaced:
 *   lmChatOpenAi, lmChatGoogleGemini, lmChatGroq, lmChatMistralCloud,
 *   lmChatAzureOpenAi, lmChatDeepSeek, lmChatOllama, lmChatAwsBedrock,
 *   lmChatOpenRouter, lmOpenAi (legacy)
 *
 * Nodes updated (already Anthropic, just upgrade model):
 *   lmChatAnthropic → claude-sonnet-4-6
 *
 * Nodes intentionally skipped:
 *   @n8n/n8n-nodes-langchain.openAi  — multi-purpose tool (DALL-E, Whisper, Vision)
 *   n8n-nodes-base.openAi            — direct REST integration, different architecture
 *
 * Run:          node scripts/migrate-llm-to-claude.mjs
 * Dry-run:      node scripts/migrate-llm-to-claude.mjs --dry-run
 */

import pg from 'pg';
const { Pool } = pg;

const DRY_RUN = process.argv.includes('--dry-run');
const CLAUDE_MODEL = 'claude-sonnet-4-6';
const CLAUDE_TYPE = '@n8n/n8n-nodes-langchain.lmChatAnthropic';
const CLAUDE_TYPE_VERSION = 1.2;
const CLAUDE_CREDENTIALS = {
  anthropicApi: { id: '{{ $env.ANTHROPIC_CREDENTIAL_ID }}', name: 'DevHubConnect Anthropic' },
};

const pool = new Pool({
  connectionString:
    'postgresql://postgres:atUkFxuogjjZODArPEnnbgUtSlZZswCe@ballast.proxy.rlwy.net:59419/railway',
});

// ---------- node sets ----------

/** LLM backbone nodes that get fully replaced by lmChatAnthropic */
const REPLACE_TYPES = new Set([
  '@n8n/n8n-nodes-langchain.lmChatOpenAi',
  '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
  '@n8n/n8n-nodes-langchain.lmChatGroq',
  '@n8n/n8n-nodes-langchain.lmChatMistralCloud',
  '@n8n/n8n-nodes-langchain.lmChatAzureOpenAi',
  '@n8n/n8n-nodes-langchain.lmChatDeepSeek',
  '@n8n/n8n-nodes-langchain.lmChatOllama',
  '@n8n/n8n-nodes-langchain.lmChatAwsBedrock',
  '@n8n/n8n-nodes-langchain.lmChatOpenRouter',
  '@n8n/n8n-nodes-langchain.lmOpenAi',
]);

// ---------- helpers ----------

/** Extract temperature/maxTokens from any LLM node's parameters */
function extractOptions(params = {}) {
  const src = params.options || {};
  const opts = {};
  if (src.temperature !== undefined) opts.temperature = src.temperature;
  // maxTokens may be named differently across providers
  const mt = src.maxTokens ?? src.maxOutputTokens ?? src.max_tokens;
  if (mt !== undefined) opts.maxTokens = mt;
  return opts;
}

/** Build the replacement Claude node, preserving position/name/id/disabled */
function buildClaudeNode(original) {
  const opts = extractOptions(original.parameters);
  const parameters = { model: CLAUDE_MODEL };
  if (Object.keys(opts).length > 0) parameters.options = opts;

  return {
    ...original,
    type: CLAUDE_TYPE,
    typeVersion: CLAUDE_TYPE_VERSION,
    parameters,
    credentials: CLAUDE_CREDENTIALS,
  };
}

/** Migrate one workflow JSON — returns { changed, newWf, replaced, updated } */
function migrateWorkflow(wf) {
  const nodes = wf.nodes || [];
  const replaced = [];
  const updated = [];

  const newNodes = nodes.map((node) => {
    // Fully replace non-Claude LLM backbone nodes
    if (REPLACE_TYPES.has(node.type)) {
      const oldModel =
        node.parameters?.model?.value ??
        node.parameters?.model ??
        node.parameters?.modelName ??
        node.parameters?.modelId?.value ??
        '(not set)';
      const newNode = buildClaudeNode(node);
      replaced.push({ name: node.name, from: node.type, oldModel });
      return newNode;
    }

    // Update existing Anthropic nodes to latest model
    if (node.type === CLAUDE_TYPE) {
      const currentModel = node.parameters?.model;
      if (currentModel !== CLAUDE_MODEL) {
        updated.push({ name: node.name, from: currentModel, to: CLAUDE_MODEL });
        return {
          ...node,
          typeVersion: CLAUDE_TYPE_VERSION,
          parameters: { ...node.parameters, model: CLAUDE_MODEL },
        };
      }
    }

    return node;
  });

  const changed = replaced.length > 0 || updated.length > 0;
  if (!changed) return { changed: false, replaced: [], updated: [] };

  return { changed: true, newWf: { ...wf, nodes: newNodes }, replaced, updated };
}

// ---------- main ----------

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      'SELECT id, name, workflow_json FROM templates ORDER BY id'
    );
    console.log(`Loaded ${rows.length} workflows.\n`);

    let totalReplaced = 0;
    let totalUpdated = 0;
    let workflowsChanged = 0;

    for (const row of rows) {
      const { id, name, workflow_json: wf } = row;
      if (!wf) continue;

      const result = migrateWorkflow(wf);
      if (!result.changed) continue;

      totalReplaced += result.replaced.length;
      totalUpdated += result.updated.length;
      workflowsChanged++;

      console.log(`[${id}] ${name}`);
      for (const r of result.replaced) {
        console.log(`  REPLACED : '${r.name}' ${r.from} (${r.oldModel}) → ${CLAUDE_TYPE} (${CLAUDE_MODEL})`);
      }
      for (const u of result.updated) {
        console.log(`  UPDATED  : '${u.name}' model: ${u.from} → ${u.to}`);
      }

      if (!DRY_RUN) {
        await client.query('UPDATE templates SET workflow_json = $1 WHERE id = $2', [
          JSON.stringify(result.newWf),
          id,
        ]);
      }
    }

    console.log('\n========== SUMMARY ==========');
    console.log(`LLM nodes replaced with Claude    : ${totalReplaced}`);
    console.log(`Anthropic nodes model updated     : ${totalUpdated}`);
    console.log(`Workflows changed                 : ${workflowsChanged}`);
    console.log(`Workflows updated in DB           : ${DRY_RUN ? '(dry-run, 0)' : workflowsChanged}`);

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
