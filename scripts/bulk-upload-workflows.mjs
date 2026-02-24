#!/usr/bin/env node
/**
 * bulk-upload-workflows.mjs
 * Finds n8n workflows not on the website, compresses JSON, generates descriptions,
 * and uploads them to Railway PostgreSQL.
 *
 * Usage:
 *   node scripts/bulk-upload-workflows.mjs              # live run
 *   node scripts/bulk-upload-workflows.mjs --dry-run    # preview only
 *   node scripts/bulk-upload-workflows.mjs --limit 10   # upload first 10 missing
 *   node scripts/bulk-upload-workflows.mjs --start 50   # skip first 50 missing (resume)
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const Database = require('/Users/edgartamarind/.claude/n8n-mcp/node_modules/better-sqlite3');
const { Pool } = require('/Users/edgartamarind/Downloads/automations/node_modules/pg');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Config ─────────────────────────────────────────────────────────────────
const N8N_API_URL = 'http://localhost:5678/api/v1';
const N8N_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI3YmNjODYzMi03OWM2LTQ4NzAtOWEyZi03YWQwZmM1MGJlNDkiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcxODcyMDY0fQ.MMSbuaIwGKSsIuUMnUUYhX13nZuW_lqq-fQLF2yWbHo';
const DATABASE_URL = 'postgresql://postgres:atUkFxuogjjZODArPEnnbgUtSlZZswCe@ballast.proxy.rlwy.net:59419/railway';
const N8N_SQLITE = path.join(process.env.HOME, '.n8n/database.sqlite');
const DEFAULT_PRICE = 499; // $4.99 in cents
const GROQ_DELAY_MS = 1200; // rate limit between GROQ calls

// Parse GROQ key from .env (handles spaces around =)
const envRaw = readFileSync(path.join(__dirname, '../.env'), 'utf8');
const GROQ_API_KEY = envRaw.match(/GROQ_API_KEY\s*=\s*(.+)/)?.[1]?.trim();

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
});

// ─── Workflow compression ────────────────────────────────────────────────────
function compressWorkflow(wf) {
  return {
    id: wf.id,
    name: wf.name,
    nodes: (wf.nodes || []).map(({ credentials, ...rest }) => rest),
    connections: wf.connections || {},
    settings: wf.settings || {},
    ...(wf.pinData && Object.keys(wf.pinData).length ? { pinData: wf.pinData } : {}),
  };
}

// ─── Category inference ──────────────────────────────────────────────────────
function inferCategory(name, nodes = []) {
  const text = (name + ' ' + nodes.map(n => n.type || '').join(' ')).toLowerCase();
  const cats = [
    ['ai',            ['openai', 'anthropic', 'langchain', 'llm', 'gpt', 'claude', 'mistral', 'embeddings', 'vectorstore', 'qdrant', 'pinecone', 'agent']],
    ['email',         ['email', 'gmail', 'mailchimp', 'sendgrid', 'mailgun', 'smtp', 'imap', 'mailerlite', 'postmark']],
    ['social-media',  ['instagram', 'twitter', 'linkedin', 'facebook', 'tiktok', 'youtube', 'social']],
    ['communication', ['slack', 'discord', 'telegram', 'whatsapp', 'sms', 'twilio', 'vonage', 'mattermost', 'push']],
    ['crm',           ['crm', 'hubspot', 'salesforce', 'pipedrive', 'lead', 'contact', 'customer.io']],
    ['finance',       ['stripe', 'paypal', 'payment', 'billing', 'invoice', 'paddle', 'chargebee']],
    ['ecommerce',     ['shopify', 'woocommerce', 'odoo', 'order', 'ecommerce', 'product']],
    ['database',      ['postgres', 'mysql', 'mongodb', 'supabase', 'airtable', 'database', 'sql', 'redis']],
    ['devops',        ['github', 'gitlab', 'ci/cd', 'docker', 'aws', 'deploy', 'kubernetes', 'jenkins']],
    ['document',      ['pdf', 'ocr', 'document', 'file', 'extraction', 'parse']],
    ['data',          ['scraper', 'scraping', 'brightdata', 'phantombuster', 'extract', 'spreadsheet', 'csv', 'excel']],
    ['productivity',  ['google', 'notion', 'trello', 'jira', 'calendar', 'todoist', 'asana', 'sheets', 'drive']],
  ];
  for (const [cat, keywords] of cats) {
    if (keywords.some(k => text.includes(k))) return cat;
  }
  return 'automation';
}

// ─── Slug generation ─────────────────────────────────────────────────────────
function makeSlug(name, n8nId) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 180);
  return `${base}-${n8nId.slice(0, 8)}`;
}

// ─── Description generation via GROQ ────────────────────────────────────────
async function generateDescription(wf) {
  if (!GROQ_API_KEY) return fallbackDescription(wf);

  const nodeNames = wf.nodes.slice(0, 12).map(n => n.name).join(', ');
  const nodeTypes = [...new Set(wf.nodes.map(n => (n.type || '').split('.').pop()))].slice(0, 8).join(', ');
  const nodeCount = wf.nodes.length;

  const prompt = `You are writing a marketplace listing for an n8n workflow automation template named "${wf.name}".

Workflow has ${nodeCount} nodes. Key node names: ${nodeNames}. Node types: ${nodeTypes}.

Write a professional description in EXACTLY 3 prose paragraphs (no headers, no bullet points):

PARAGRAPH 1 (~100 words): What this workflow automates, what manual process it replaces, what it does step-by-step mentioning actual node names, who benefits (job title, company size, daily volume), quantified time savings (e.g. from 20-30 minutes to seconds per task).

PARAGRAPH 2 (~80 words): ROI and business value (hours saved weekly, queries/tasks handled), 3 specific use cases, technical requirements with costs (API keys needed with approximate pricing like ~$0.01/1K tokens, external services with pricing, n8n instance).

PARAGRAPH 3 (~120 words): Step-by-step setup (where to get accounts/API keys, configure n8n credentials, configure key nodes, expose webhooks if needed). Then: how to test with example inputs, 3-4 common errors with fixes (e.g. 401 invalid key, 429 rate limit). End with: deploy by activating workflow, maintenance tips (monitor logs, rotate keys, tune parameters).

Be specific to the actual nodes. Professional tone. Output only the 3 paragraphs separated by blank lines.`;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 700,
        temperature: 0.65,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`GROQ ${res.status}: ${err.slice(0, 100)}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    if (text && text.length > 100) return text;
    throw new Error('Empty response');
  } catch (err) {
    console.warn(`    ⚠️  GROQ failed: ${err.message} — using fallback`);
    return fallbackDescription(wf);
  }
}

function fallbackDescription(wf) {
  const types = [...new Set((wf.nodes || []).map(n => (n.type || '').split('.').pop()))].slice(0, 5).join(', ');
  return `This workflow automates ${wf.name} using n8n's powerful automation engine. It orchestrates ${wf.nodes?.length || 0} nodes including ${types} to create a seamless end-to-end pipeline, eliminating manual steps and saving hours weekly for teams handling repetitive tasks.

Designed for operations and automation teams, this template delivers immediate ROI by reducing manual intervention. Use cases include data synchronization, notification pipelines, API integrations, and scheduled processing. Requirements: relevant API credentials for connected services, an n8n instance (free at n8n.io or cloud.n8n.io ~$20/month).

Install n8n and import this template. Configure credentials for each connected service under n8n Settings > Credentials. Review and update node parameters to match your environment (API endpoints, collection names, field mappings). Activate the workflow and run a test execution with sample data. Check execution logs for errors — common issues include invalid credentials (401), rate limits (429, add retry logic), or misconfigured parameters (500). Deploy by keeping the workflow active; monitor logs weekly and rotate API keys quarterly.`;
}

// ─── Fetch all n8n workflow IDs/names from API (paginated) ──────────────────
async function fetchAllN8nWorkflows() {
  const all = [];
  let cursor = null;

  do {
    const url = cursor
      ? `${N8N_API_URL}/workflows?limit=100&cursor=${cursor}`
      : `${N8N_API_URL}/workflows?limit=100`;

    const res = await fetch(url, { headers: { 'X-N8N-API-KEY': N8N_API_KEY } });
    if (!res.ok) throw new Error(`n8n API error: ${res.status}`);

    const body = await res.json();
    const data = body.data || body;
    const workflows = data.workflows || data;
    cursor = data.nextCursor || null;

    for (const wf of workflows) {
      all.push({ id: wf.id, name: wf.name });
    }

    process.stdout.write(`\r  Fetched ${all.length} workflows from n8n...`);
  } while (cursor);

  process.stdout.write('\n');
  return all;
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitIdx = args.indexOf('--limit');
  const startIdx = args.indexOf('--start');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) : null;
  const startAt = startIdx !== -1 ? parseInt(args[startIdx + 1]) : 0;

  console.log('\n🚀 DevHubConnect Bulk Workflow Uploader');
  console.log(`   Mode:  ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
  if (limit)   console.log(`   Limit: ${limit}`);
  if (startAt) console.log(`   Start: skip first ${startAt}`);
  console.log('');

  const client = await pool.connect();

  try {
    // Get existing template names from Railway
    const { rows: existing } = await client.query('SELECT name FROM templates');
    const existingNames = new Set(existing.map(r => r.name));
    console.log(`📦 Railway DB:  ${existingNames.size} existing templates`);

    // Get admin user ID
    const { rows: adminRows } = await client.query(
      `SELECT id FROM users WHERE email = 'edgarshopify@gmail.com' LIMIT 1`
    );
    const adminId = adminRows[0]?.id;
    if (!adminId) throw new Error('Admin user not found in Railway DB');
    console.log(`👤 Admin ID:    ${adminId}`);

    // Fetch all n8n workflows (use SQLite for speed)
    console.log('🔧 Loading n8n workflows from SQLite...');
    const db = new Database(N8N_SQLITE, { readonly: true });
    const allN8n = db.prepare('SELECT id, name FROM workflow_entity ORDER BY name').all();
    db.close();
    console.log(`🔧 n8n local:   ${allN8n.length} workflows`);

    // Find missing
    const missing = allN8n.filter(wf => !existingNames.has(wf.name));
    console.log(`📋 Missing:     ${missing.length} workflows\n`);

    const toProcess = missing.slice(startAt, limit ? startAt + limit : undefined);
    console.log(`📤 Processing:  ${toProcess.length} workflows`);
    console.log(`🤖 GROQ:        ${GROQ_API_KEY ? 'enabled' : 'disabled (fallback descriptions)'}\n`);

    if (dryRun) {
      console.log('── DRY RUN PREVIEW ──────────────────────────────');
      toProcess.slice(0, 20).forEach((wf, i) => {
        console.log(`  ${startAt + i + 1}. ${wf.name}`);
      });
      if (toProcess.length > 20) console.log(`  ... and ${toProcess.length - 20} more`);
      console.log(`\nTotal would upload: ${toProcess.length}`);
      return;
    }

    // Process
    let uploaded = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < toProcess.length; i++) {
      const wf = toProcess[i];
      const num = `[${startAt + i + 1}/${missing.length}]`;
      process.stdout.write(`${num} ${wf.name.slice(0, 60)}`);

      try {
        // Fetch full workflow from n8n API
        const res = await fetch(`${N8N_API_URL}/workflows/${wf.id}`, {
          headers: { 'X-N8N-API-KEY': N8N_API_KEY },
        });

        if (!res.ok) {
          console.log(` → ⚠️  n8n ${res.status}`);
          failed++;
          continue;
        }

        const full = await res.json();
        const compressed = compressWorkflow(full);
        const category = inferCategory(wf.name, full.nodes || []);
        const slug = makeSlug(wf.name, wf.id);

        // Generate description
        process.stdout.write(' → generating...');
        const description = await generateDescription(compressed);
        await new Promise(r => setTimeout(r, GROQ_DELAY_MS));

        // Insert into Railway DB
        await client.query(
          `INSERT INTO templates
             (name, description, price, workflow_json, creator_id, status, is_public, category, slug)
           VALUES ($1, $2, $3, $4, $5, 'published', true, $6, $7)
           ON CONFLICT (slug) DO NOTHING`,
          [
            wf.name,
            description,
            DEFAULT_PRICE,
            JSON.stringify(compressed),
            adminId,
            category,
            slug,
          ]
        );

        console.log(` → ✅ ${category}`);
        uploaded++;
      } catch (err) {
        console.log(` → ❌ ${err.message.slice(0, 60)}`);
        failed++;
      }
    }

    console.log('\n────────────────────────────────────────');
    console.log(`✅ Uploaded: ${uploaded}`);
    console.log(`⏭️  Skipped:  ${skipped}`);
    console.log(`❌ Failed:   ${failed}`);
    console.log(`📦 DB total: ~${existingNames.size + uploaded} templates`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('\n💥 Fatal error:', err.message);
  process.exit(1);
});
