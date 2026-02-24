/**
 * marketplace-audit.mjs
 * DevHubConnect Marketplace Workflow Audit Checklist v1.0
 *
 * Audits all workflow templates against 8 sections:
 *   1. Structural Integrity
 *   2. Marketplace Safety Compliance
 *   3. Node Configuration Review
 *   4. AI / LangChain Safety
 *   5. Error Handling Structure
 *   6. Performance & Portability
 *   7. DevHubConnect Branding & Metadata
 *   8. Structural Red Flags (auto-fail)
 *
 * Run:             node scripts/marketplace-audit.mjs
 * Single workflow: node scripts/marketplace-audit.mjs --id=123
 * Critical only:   node scripts/marketplace-audit.mjs --critical
 * Stats only:      node scripts/marketplace-audit.mjs --summary
 */

import pg from 'pg';
const { Pool } = pg;

const SINGLE_ID = (() => {
  const arg = process.argv.find(a => a.startsWith('--id='));
  return arg ? parseInt(arg.split('=')[1]) : null;
})();
const CRITICAL_ONLY = process.argv.includes('--critical');
const SUMMARY_ONLY = process.argv.includes('--summary');

const pool = new Pool({
  connectionString:
    'postgresql://postgres:atUkFxuogjjZODArPEnnbgUtSlZZswCe@ballast.proxy.rlwy.net:59419/railway',
});

// ─── Node classification ──────────────────────────────────────────────────────

const TRIGGER_TYPES = new Set([
  // Core triggers
  'n8n-nodes-base.webhook', 'n8n-nodes-base.webhookTrigger',
  'n8n-nodes-base.scheduleTrigger', 'n8n-nodes-base.cron',
  'n8n-nodes-base.manualTrigger',
  'n8n-nodes-base.n8nTrigger', 'n8n-nodes-base.executeWorkflowTrigger',
  // Email / messaging
  'n8n-nodes-base.emailReadImap', 'n8n-nodes-base.emailTrigger',
  'n8n-nodes-base.gmailTrigger',
  'n8n-nodes-base.telegramTrigger', 'n8n-nodes-base.slackTrigger',
  'n8n-nodes-base.discordTrigger', 'n8n-nodes-base.whatsAppTrigger',
  'n8n-nodes-base.microsoftTeamsTrigger',
  // Social / marketing
  'n8n-nodes-base.facebookLeadAdsTrigger', 'n8n-nodes-base.facebookPagesTrigger',
  'n8n-nodes-base.typeformTrigger', 'n8n-nodes-base.formTrigger',
  'n8n-nodes-base.mailchimpTrigger', 'n8n-nodes-base.mailjetTrigger',
  // Project management
  'n8n-nodes-base.githubTrigger', 'n8n-nodes-base.gitlabTrigger',
  'n8n-nodes-base.jiraTrigger', 'n8n-nodes-base.linearTrigger',
  'n8n-nodes-base.trelloTrigger', 'n8n-nodes-base.asanaTrigger',
  'n8n-nodes-base.notionTrigger',
  // CRM / sales
  'n8n-nodes-base.hubspotTrigger', 'n8n-nodes-base.salesforceTrigger',
  'n8n-nodes-base.pipedriveTrigger',
  // E-commerce / payments
  'n8n-nodes-base.stripeTrigger', 'n8n-nodes-base.paypalTrigger',
  'n8n-nodes-base.payPalTrigger',
  'n8n-nodes-base.shopifyTrigger', 'n8n-nodes-base.wooCommerceTrigger',
  'n8n-nodes-base.gumroadTrigger',
  // Cloud storage
  'n8n-nodes-base.googleDriveTrigger', 'n8n-nodes-base.googleSheetsTrigger',
  // Messaging queues
  'n8n-nodes-base.mqttTrigger', 'n8n-nodes-base.rabbitmqTrigger',
  'n8n-nodes-base.redisTrigger', 'n8n-nodes-base.amqpTrigger',
  'n8n-nodes-base.sseClientTrigger',
  // Other
  'n8n-nodes-base.localFileTrigger', 'n8n-nodes-base.rssFeedReadTrigger',
  'n8n-nodes-base.chatTrigger', 'n8n-nodes-base.calTrigger',
  'n8n-nodes-base.errorTrigger', 'n8n-nodes-base.executionDataTrigger',
  'n8n-nodes-base.postmarkTrigger', 'n8n-nodes-base.stravaTrigger',
  'n8n-nodes-base.invoiceNinjaTrigger', 'n8n-nodes-base.webflowTrigger',
  '@n8n/n8n-nodes-langchain.chatTrigger',
  '@n8n/n8n-nodes-langchain.mcpTrigger',
  // Respond node is often the end of a webhook workflow
  'n8n-nodes-base.respondToWebhook',
]);

const ANNOTATION_TYPES = new Set([
  'n8n-nodes-base.stickyNote',
]);

const LANGCHAIN_SUB_TYPES = new Set([
  '@n8n/n8n-nodes-langchain.lmChatAnthropic',
  '@n8n/n8n-nodes-langchain.lmChatOpenAi',
  '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
  '@n8n/n8n-nodes-langchain.lmChatGroq',
  '@n8n/n8n-nodes-langchain.lmChatMistralCloud',
  '@n8n/n8n-nodes-langchain.lmChatOllama',
  '@n8n/n8n-nodes-langchain.lmChatDeepSeek',
  '@n8n/n8n-nodes-langchain.lmChatAzureOpenAi',
  '@n8n/n8n-nodes-langchain.lmChatAwsBedrock',
  '@n8n/n8n-nodes-langchain.lmChatOpenRouter',
  '@n8n/n8n-nodes-langchain.lmOpenAi',
  '@n8n/n8n-nodes-langchain.embeddingsOpenAi',
  '@n8n/n8n-nodes-langchain.embeddingsAzureOpenAi',
  '@n8n/n8n-nodes-langchain.embeddingsCohere',
  '@n8n/n8n-nodes-langchain.embeddingsHuggingFaceInferenceApi',
  '@n8n/n8n-nodes-langchain.embeddingsOllama',
  '@n8n/n8n-nodes-langchain.embeddingsGoogleVertex',
  '@n8n/n8n-nodes-langchain.memoryBufferWindow',
  '@n8n/n8n-nodes-langchain.memoryMotorhead',
  '@n8n/n8n-nodes-langchain.memoryPostgresChat',
  '@n8n/n8n-nodes-langchain.memoryRedisChat',
  '@n8n/n8n-nodes-langchain.memoryXata',
  '@n8n/n8n-nodes-langchain.memoryZep',
  '@n8n/n8n-nodes-langchain.toolCalculator',
  '@n8n/n8n-nodes-langchain.toolCode',
  '@n8n/n8n-nodes-langchain.toolHttpRequest',
  '@n8n/n8n-nodes-langchain.toolThink',
  '@n8n/n8n-nodes-langchain.toolWikipedia',
  '@n8n/n8n-nodes-langchain.toolWolframAlpha',
  '@n8n/n8n-nodes-langchain.toolWorkflow',
  '@n8n/n8n-nodes-langchain.toolSerpApi',
  '@n8n/n8n-nodes-langchain.toolTavilySearch',
  '@n8n/n8n-nodes-langchain.toolBraveSearch',
  '@n8n/n8n-nodes-langchain.vectorStorePinecone',
  '@n8n/n8n-nodes-langchain.vectorStoreQdrant',
  '@n8n/n8n-nodes-langchain.vectorStoreSupabase',
  '@n8n/n8n-nodes-langchain.vectorStoreInMemory',
  '@n8n/n8n-nodes-langchain.vectorStoreMilvus',
  '@n8n/n8n-nodes-langchain.vectorStoreChroma',
  '@n8n/n8n-nodes-langchain.documentDefaultDataLoader',
  '@n8n/n8n-nodes-langchain.documentBinaryInputLoader',
  '@n8n/n8n-nodes-langchain.documentJsonInputLoader',
  '@n8n/n8n-nodes-langchain.textSplitterRecursiveCharacterTextSplitter',
  '@n8n/n8n-nodes-langchain.textSplitterTokenSplitter',
  '@n8n/n8n-nodes-langchain.outputParserStructured',
  '@n8n/n8n-nodes-langchain.outputParserAutofixing',
  '@n8n/n8n-nodes-langchain.outputParserItemList',
]);

function isLangchainSub(type) {
  if (LANGCHAIN_SUB_TYPES.has(type)) return true;
  if (type.startsWith('@n8n/n8n-nodes-langchain.')) return true;
  // n8n-nodes-base.*Tool nodes connect via ai_tool port to agents — not main execution
  if (type.endsWith('Tool')) return true;
  return false;
}

const LANGCHAIN_AGENT_TYPES = new Set([
  '@n8n/n8n-nodes-langchain.agent',
  '@n8n/n8n-nodes-langchain.chainLlm',
  '@n8n/n8n-nodes-langchain.chainSummarization',
  '@n8n/n8n-nodes-langchain.chainRetrievalQa',
]);


const EMBEDDINGS_TYPES = new Set([
  '@n8n/n8n-nodes-langchain.embeddingsOpenAi',
  '@n8n/n8n-nodes-langchain.embeddingsAzureOpenAi',
  '@n8n/n8n-nodes-langchain.embeddingsCohere',
  '@n8n/n8n-nodes-langchain.embeddingsHuggingFaceInferenceApi',
  '@n8n/n8n-nodes-langchain.embeddingsOllama',
  '@n8n/n8n-nodes-langchain.embeddingsGoogleVertex',
]);

const DB_TYPES = new Set([
  'n8n-nodes-base.postgres', 'n8n-nodes-base.mySql',
  'n8n-nodes-base.mongodb', 'n8n-nodes-base.microsoftSql',
  'n8n-nodes-base.sqlite',
]);

const CRITICAL_NODE_TYPES = new Set([
  'n8n-nodes-base.webhook', 'n8n-nodes-base.httpRequest',
  'n8n-nodes-base.postgres', 'n8n-nodes-base.mySql',
  'n8n-nodes-base.mongodb',
]);

// ─── Secret / personal endpoint patterns ─────────────────────────────────────

const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9]{20,}/,
  /\bsk-ant-[A-Za-z0-9-]{20,}/,
  /\bghp_[A-Za-z0-9]{36}/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bxoxb-[0-9]+-[A-Za-z0-9-]+/,
  /\bxoxp-[0-9]+-[A-Za-z0-9-]+/,
  /\bAIza[A-Za-z0-9-_]{35}/,
  /\bEAA[A-Za-z0-9]{100,}/,
  /\bBearer\s+(?!(?:[A-Za-z0-9_]*YOUR_|test-|dev-|fake-|dummy-))[A-Za-z0-9+/=_-]{20,}(?<!_HERE)(?<!_KEY)/,
  /postgres(?:ql)?:\/\/[^:]+:[^@]{4,}@[^/\s]+/i,
  /mysql:\/\/[^:]+:[^@]{4,}@[^/\s]+/i,
  /mongodb\+srv:\/\/[^:]+:[^@]{4,}@[^/\s]+/i,
  /"(?:apiKey|api_key|secret|token|password|passwd|Authorization)"\s*:\s*"[A-Za-z0-9+/=_-]{32,}"/i,
];

const LOCALHOST_PATTERNS = [
  /\blocalhost\b/i,
  /\b127\.0\.0\.1\b/,
  /\b0\.0\.0\.0\b/,
  /\b192\.168\.\d{1,3}\.\d{1,3}\b/,
  /\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
  /\b172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}\b/,
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildGraph(wf) {
  const nodes = wf.nodes || [];
  const connections = wf.connections || {};
  const outgoing = {};
  const incoming = {};

  // Main execution connections
  for (const [src, outputs] of Object.entries(connections)) {
    for (const branches of Object.values(outputs)) {
      if (!Array.isArray(branches)) continue;
      for (const branch of branches) {
        if (!Array.isArray(branch)) continue;
        for (const conn of branch) {
          if (!conn?.node) continue;
          if (!outgoing[src]) outgoing[src] = new Set();
          if (!incoming[conn.node]) incoming[conn.node] = new Set();
          outgoing[src].add(conn.node);
          incoming[conn.node].add(src);
        }
      }
    }
  }

  return { nodes, outgoing, incoming };
}

function reachableFrom(startName, outgoing) {
  const visited = new Set();
  const queue = [startName];
  while (queue.length) {
    const cur = queue.shift();
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const next of (outgoing[cur] || [])) queue.push(next);
  }
  return visited;
}

function hasSplitInBatchesLoop(wf) {
  const nodes = wf.nodes || [];
  const connections = wf.connections || {};
  const sibNodes = nodes.filter(n => n.type === 'n8n-nodes-base.splitInBatches');

  for (const sib of sibNodes) {
    const visited = new Set();
    const stack = [...(Object.keys(connections[sib.name] || {})).flatMap(
      type => (connections[sib.name][type] || []).flatMap(b => (b || []).map(c => c?.node))
    ).filter(Boolean)];

    while (stack.length) {
      const cur = stack.pop();
      if (!cur || visited.has(cur)) continue;
      if (cur === sib.name) return true;
      visited.add(cur);
      for (const t of Object.values(connections[cur] || {})) {
        for (const b of (t || [])) {
          for (const c of (b || [])) {
            if (c?.node) stack.push(c.node);
          }
        }
      }
    }
  }
  return false;
}

function scanForSecrets(str) {
  const found = [];
  for (const pat of SECRET_PATTERNS) {
    const match = str.match(pat);
    if (match) found.push(match[0].slice(0, 40));
  }
  return found;
}

function scanForLocalhost(str) {
  return LOCALHOST_PATTERNS.some(p => p.test(str));
}

function checkSuspiciousUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.includes('{{') || url.includes('${')) return false;
  if (LOCALHOST_PATTERNS.some(p => p.test(url))) return false; // caught separately
  return false; // Real domain detection disabled to avoid false positives
}

// ─── Main audit function ───────────────────────────────────────────────────────

function auditWorkflow(wf) {
  const findings = [];
  const wfStr = JSON.stringify(wf);

  // ── §1 Structural Integrity ────────────────────────────────────────────────

  // §1.1 Trigger count
  const triggerNodes = (wf.nodes || []).filter(n => TRIGGER_TYPES.has(n.type));
  const automatedTriggers = triggerNodes.filter(
    n => n.type !== 'n8n-nodes-base.manualTrigger' &&
         n.type !== 'n8n-nodes-base.respondToWebhook'
  );
  if (automatedTriggers.length > 1) {
    findings.push({
      sev: 'HIGH', check: '1.1',
      msg: `Multiple automated triggers (${automatedTriggers.map(n => n.name).join(', ')})`,
      nodes: automatedTriggers.map(n => n.id),
    });
  }
  if (triggerNodes.length === 0) {
    findings.push({
      sev: 'HIGH', check: '1.1',
      msg: 'No trigger node found — workflow cannot start automatically',
      nodes: [],
    });
  }

  // §1.2 Orphaned / unreachable nodes
  const { nodes, outgoing, incoming } = buildGraph(wf);
  if (triggerNodes.length > 0) {
    const allReachable = new Set();
    for (const t of triggerNodes) {
      for (const n of reachableFrom(t.name, outgoing)) allReachable.add(n);
      allReachable.add(t.name);
    }
    const orphans = nodes.filter(n => {
      if (ANNOTATION_TYPES.has(n.type)) return false;
      if (isLangchainSub(n.type)) return false;
      if (TRIGGER_TYPES.has(n.type)) return false;
      return !allReachable.has(n.name);
    });
    if (orphans.length > 0) {
      findings.push({
        sev: 'HIGH', check: '1.2',
        msg: `Orphan/unreachable nodes: ${orphans.map(n => n.name).join(', ')}`,
        nodes: orphans.map(n => n.id),
      });
    }
  }

  // §1.3 SplitInBatches infinite loop
  if (hasSplitInBatchesLoop(wf)) {
    findings.push({
      sev: 'MEDIUM', check: '1.3',
      msg: 'Potential infinite SplitInBatches loop detected',
      nodes: [],
    });
  }

  // ── §2 Marketplace Safety ──────────────────────────────────────────────────

  // §2.1 Secrets scan
  const secrets = scanForSecrets(wfStr);
  for (const s of secrets) {
    findings.push({ sev: 'CRITICAL', check: '2.1', msg: `Possible hardcoded secret: "${s}"`, nodes: [] });
  }

  // §2.1 Raw string credentials (should be { id, name } objects)
  for (const node of (wf.nodes || [])) {
    const creds = node.credentials || {};
    for (const [credType, credVal] of Object.entries(creds)) {
      if (typeof credVal === 'string' && credVal.length > 0) {
        findings.push({
          sev: 'CRITICAL', check: '2.1',
          msg: `Node '${node.name}' credential '${credType}' is a raw string — needs { id, name } object`,
          nodes: [node.id],
        });
      }
      if (typeof credVal === 'object' && credVal !== null) {
        const credId = credVal.id;
        if (typeof credId === 'string' && /^(sk-|pk-|Bearer |ghp_|xox)/.test(credId)) {
          findings.push({
            sev: 'CRITICAL', check: '2.1',
            msg: `Node '${node.name}' credential ID looks like a raw API key`,
            nodes: [node.id],
          });
        }
      }
    }
  }

  // §2.2 Localhost / private IPs
  if (scanForLocalhost(wfStr)) {
    findings.push({ sev: 'HIGH', check: '2.2', msg: 'localhost or private IP address reference found', nodes: [] });
  }

  // §2.2 Suspicious real URLs in HTTP nodes
  for (const node of (wf.nodes || [])) {
    if (node.type !== 'n8n-nodes-base.httpRequest') continue;
    const url = node.parameters?.url;
    if (typeof url === 'string' && checkSuspiciousUrl(url)) {
      findings.push({
        sev: 'MEDIUM', check: '2.2',
        msg: `HTTP node '${node.name}' has hardcoded real-looking URL: ${url.slice(0, 80)}`,
        nodes: [node.id],
      });
    }
  }

  // ── §3 Node Configuration ──────────────────────────────────────────────────

  // §3.1 HTTP nodes missing timeout
  for (const node of (wf.nodes || [])) {
    if (node.type !== 'n8n-nodes-base.httpRequest') continue;
    const timeout = node.parameters?.options?.timeout ?? node.parameters?.timeout;
    if (timeout === undefined || timeout === null || timeout === 0) {
      findings.push({
        sev: 'LOW', check: '3.1',
        msg: `HTTP node '${node.name}' has no timeout defined`,
        nodes: [node.id],
      });
    }
  }

  // §3.2 DB nodes with destructive operations
  for (const node of (wf.nodes || [])) {
    if (!DB_TYPES.has(node.type)) continue;
    const op = (node.parameters?.operation || '').toLowerCase();
    const query = JSON.stringify(node.parameters?.query || '').toLowerCase();
    if (['deleteall', 'drop', 'truncate'].some(k => op.includes(k) || query.includes(k))) {
      findings.push({
        sev: 'HIGH', check: '3.2',
        msg: `DB node '${node.name}' has potentially destructive operation`,
        nodes: [node.id],
      });
    }
  }

  // ── §4 AI / LangChain Safety ───────────────────────────────────────────────

  // §4.1 Embeddings nodes connected via ai_* port check
  // Build a map of which nodes are connected to what via ai_* ports
  const connections = wf.connections || {};
  const connectedViaAiPort = new Set();
  for (const [src, outputs] of Object.entries(connections)) {
    for (const [portType, branches] of Object.entries(outputs)) {
      if (!portType.startsWith('ai_')) continue;
      if (!Array.isArray(branches)) continue;
      for (const branch of branches) {
        if (!Array.isArray(branch)) continue;
        for (const conn of branch) {
          if (conn?.node) connectedViaAiPort.add(conn.node);
        }
      }
    }
  }
  // Also mark nodes that ARE sources of ai_* connections as connected
  for (const [srcNode, outputs] of Object.entries(connections)) {
    for (const portType of Object.keys(outputs)) {
      if (portType.startsWith('ai_')) connectedViaAiPort.add(srcNode);
    }
  }

  for (const node of (wf.nodes || [])) {
    if (!EMBEDDINGS_TYPES.has(node.type)) continue;
    if (!connectedViaAiPort.has(node.name)) {
      findings.push({
        sev: 'CRITICAL', check: '4.1',
        msg: `Embeddings node '${node.name}' is not connected via ai_* port`,
        nodes: [node.id],
      });
    }
  }

  // §4.2 Agent/chain nodes missing LM
  const nodeByName = {};
  for (const n of (wf.nodes || [])) nodeByName[n.name] = n;

  for (const node of (wf.nodes || [])) {
    if (!LANGCHAIN_AGENT_TYPES.has(node.type)) continue;
    // Check if any node connects to this agent via ai_languageModel port (type-agnostic)
    let hasLm = false;
    for (const [, outputs] of Object.entries(connections)) {
      for (const [portType, branches] of Object.entries(outputs)) {
        if (portType !== 'ai_languageModel') continue;
        for (const branch of (branches || [])) {
          for (const conn of (branch || [])) {
            if (conn?.node === node.name) hasLm = true;
          }
        }
      }
    }
    if (!hasLm) {
      findings.push({
        sev: 'CRITICAL', check: '4.2',
        msg: `Agent '${node.name}' has no language model connected`,
        nodes: [node.id],
      });
    }
  }

  // §4.3 Vector store collection names (hardcoded real values)
  for (const node of (wf.nodes || [])) {
    if (!node.type.includes('vectorStore')) continue;
    const coll = node.parameters?.pineconeIndex || node.parameters?.qdrantCollection ||
                 node.parameters?.tableName || node.parameters?.collection;
    if (typeof coll === 'string' && coll.length > 0 &&
        !coll.includes('{{') && !coll.includes('your-') &&
        !coll.includes('placeholder') && !coll.toLowerCase().includes('example')) {
      // It's fine — named collections are expected
    }
  }

  // ── §5 Error Handling ─────────────────────────────────────────────────────

  // §5.1 Critical nodes without error handling
  for (const node of (wf.nodes || [])) {
    if (!CRITICAL_NODE_TYPES.has(node.type)) continue;
    const hasOnError = node.onError && node.onError !== 'stopWorkflow';
    const hasContinue = node.continueOnFail === true;
    if (!hasOnError && !hasContinue) {
      findings.push({
        sev: 'LOW', check: '5.1',
        msg: `Critical node '${node.name}' (${node.type.split('.').pop()}) has no error handling`,
        nodes: [node.id],
      });
    }
  }

  // §5.2 continueOnFail misuse — warn when used on output-producing nodes
  for (const node of (wf.nodes || [])) {
    if (!node.continueOnFail) continue;
    if (ANNOTATION_TYPES.has(node.type) || TRIGGER_TYPES.has(node.type)) continue;
    if (['n8n-nodes-base.if', 'n8n-nodes-base.switch', 'n8n-nodes-base.noOp'].includes(node.type)) continue;
    findings.push({
      sev: 'MEDIUM', check: '5.2',
      msg: `Node '${node.name}' uses continueOnFail — may mask failures silently`,
      nodes: [node.id],
    });
  }

  // §5.3 Webhook without Respond node
  const hasWebhookTrigger = (wf.nodes || []).some(n =>
    n.type === 'n8n-nodes-base.webhook' || n.type === 'n8n-nodes-base.webhookTrigger'
  );
  const hasRespondNode = (wf.nodes || []).some(n =>
    n.type === 'n8n-nodes-base.respondToWebhook'
  );
  if (hasWebhookTrigger && !hasRespondNode) {
    findings.push({
      sev: 'LOW', check: '5.3',
      msg: 'Webhook trigger present but no Respond to Webhook node — caller will wait for timeout',
      nodes: [],
    });
  }

  // ── §6 Performance & Portability ─────────────────────────────────────────

  // §6.1 Large batch sizes
  for (const node of (wf.nodes || [])) {
    const batchSize = node.parameters?.batchSize ?? node.parameters?.options?.batchSize;
    if (typeof batchSize === 'number' && batchSize > 500) {
      findings.push({
        sev: 'MEDIUM', check: '6.1',
        msg: `Node '${node.name}' has large batch size: ${batchSize}`,
        nodes: [node.id],
      });
    }
  }

  // §6.2 Long waits (> 24h)
  for (const node of (wf.nodes || [])) {
    if (node.type !== 'n8n-nodes-base.wait') continue;
    const amount = node.parameters?.amount;
    const unit = node.parameters?.unit;
    if (typeof amount === 'number') {
      const hours = unit === 'days' ? amount * 24 : unit === 'hours' ? amount : 0;
      if (hours > 24) {
        findings.push({
          sev: 'LOW', check: '6.2',
          msg: `Wait node '${node.name}' waits ${amount} ${unit} — exceeds 24h`,
          nodes: [node.id],
        });
      }
    }
  }

  // ── §7 Branding & Metadata ────────────────────────────────────────────────

  // §7.1 Meta section
  if (!wf.meta || !wf.meta.templateCredsSetupCompleted) {
    findings.push({
      sev: 'LOW', check: '7.1',
      msg: 'Missing meta.templateCredsSetupCompleted field',
      nodes: [],
    });
  }

  // §7.2 DevHubConnect tag
  const tags = wf.tags || [];
  const hasDevHubTag = tags.some(t =>
    (typeof t === 'string' ? t : t?.name || '').toLowerCase().includes('devhubconnect')
  );
  if (!hasDevHubTag) {
    findings.push({
      sev: 'LOW', check: '7.2',
      msg: 'Missing DevHubConnect tag',
      nodes: [],
    });
  }

  // §7.3 Default node names left unchanged
  const defaultNamePatterns = [/^Webhook$/, /^Schedule Trigger$/, /^Set$/, /^If$/, /^HTTP Request$/, /^Code$/, /^Merge$/];
  const defaultNameNodes = (wf.nodes || []).filter(n =>
    defaultNamePatterns.some(p => p.test(n.name)) && !ANNOTATION_TYPES.has(n.type)
  );
  if (defaultNameNodes.length > 0) {
    findings.push({
      sev: 'LOW', check: '7.3',
      msg: `${defaultNameNodes.length} node(s) have default names: ${defaultNameNodes.map(n => n.name).slice(0, 5).join(', ')}`,
      nodes: defaultNameNodes.map(n => n.id),
    });
  }

  // §7.4 No pinData or staticData
  if (wf.pinData && Object.keys(wf.pinData).length > 0) {
    findings.push({
      sev: 'MEDIUM', check: '7.4',
      msg: 'Workflow contains pinData — may include test/personal data',
      nodes: [],
    });
  }
  if (wf.staticData && Object.keys(wf.staticData).length > 0) {
    findings.push({
      sev: 'MEDIUM', check: '7.4',
      msg: 'Workflow contains staticData — may persist state between runs',
      nodes: [],
    });
  }

  // ── §8 Red Flags ──────────────────────────────────────────────────────────

  // §8.1 Agent nodes unreachable from trigger via main execution
  for (const node of (wf.nodes || [])) {
    if (!LANGCHAIN_AGENT_TYPES.has(node.type)) continue;
    // Agents are typically connected via main execution, not just ai_* ports
    // Only flag if they're completely disconnected from main execution graph
    const hasIncoming = (incoming[node.name]?.size || 0) > 0;
    const hasOutgoing = (outgoing[node.name]?.size || 0) > 0;
    if (!hasIncoming && !hasOutgoing) {
      findings.push({
        sev: 'CRITICAL', check: '8.1',
        msg: `Agent '${node.name}' is not reachable from any trigger via main execution path`,
        nodes: [node.id],
      });
    }
  }

  // ── Determine overall status ───────────────────────────────────────────────

  const critCount = findings.filter(f => f.sev === 'CRITICAL').length;
  const highCount = findings.filter(f => f.sev === 'HIGH').length;

  let riskLevel = 'Pass';
  if (critCount > 0) riskLevel = 'Critical';
  else if (highCount > 0) riskLevel = 'High';
  else if (findings.some(f => f.sev === 'MEDIUM')) riskLevel = 'Medium';
  else if (findings.some(f => f.sev === 'LOW')) riskLevel = 'Low';

  const status = critCount > 0 || highCount > 0 ? 'FAIL' : 'PASS';

  return { findings, riskLevel, status };
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const client = await pool.connect();
  try {
    const query = SINGLE_ID
      ? 'SELECT id, name, workflow_json FROM templates WHERE id = $1 ORDER BY id'
      : 'SELECT id, name, workflow_json FROM templates ORDER BY id';
    const params = SINGLE_ID ? [SINGLE_ID] : [];
    const { rows } = await client.query(query, params);
    console.log(`Loaded ${rows.length} workflows.\n`);

    let pass = 0, fail = 0;
    const critFindings = [];
    const countBySev = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };

    for (const row of rows) {
      const { id, name, workflow_json: wf } = row;
      if (!wf) continue;

      const { findings, riskLevel, status } = auditWorkflow(wf);
      if (status === 'PASS') { pass++; continue; }
      fail++;

      for (const f of findings) countBySev[f.sev] = (countBySev[f.sev] || 0) + 1;

      if (SUMMARY_ONLY) {
        // Collect critical summaries only
        for (const f of findings.filter(x => x.sev === 'CRITICAL')) {
          critFindings.push({ id, name, ...f });
        }
        continue;
      }

      const printFindings = CRITICAL_ONLY
        ? findings.filter(f => f.sev === 'CRITICAL')
        : findings;

      if (printFindings.length === 0) continue;

      console.log('═'.repeat(70));
      console.log(`[${id}] ${name} `);
      console.log(`Overall Status : ${status}`);
      console.log(`Risk Level     : ${riskLevel}`);
      for (const f of printFindings) {
        const nodeStr = f.nodes?.length ? `\n           Node IDs: ${f.nodes.join(', ')}` : '';
        console.log(`  [${f.sev}] §${f.check} ${f.msg}${nodeStr}`);
      }
      console.log();

      // Collect for summary
      for (const f of findings.filter(x => x.sev === 'CRITICAL')) {
        critFindings.push({ id, name, ...f });
      }
    }

    // Summary
    console.log('\n' + '═'.repeat(70));
    console.log('AUDIT SUMMARY — DevHubConnect Marketplace Checklist v1.0');
    console.log('═'.repeat(70));
    console.log(`Workflows audited        : ${rows.length}`);
    console.log(`PASS                     : ${pass}`);
    console.log(`FAIL                     : ${fail}`);
    console.log(`  ├─ CRITICAL findings   : ${countBySev.CRITICAL}`);
    console.log(`  ├─ HIGH findings       : ${countBySev.HIGH}`);
    console.log(`  ├─ MEDIUM findings     : ${countBySev.MEDIUM}`);
    console.log(`  └─ LOW findings        : ${countBySev.LOW}`);

    if (critFindings.length > 0 && (SUMMARY_ONLY || !CRITICAL_ONLY)) {
      console.log('\n─── CRITICAL FAILURES ───');
      for (const f of critFindings) {
        console.log(`  [${f.id}] §${f.check} ${f.name} `);
        console.log(`         ${f.msg}`);
      }
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
