/**
 * auto-generate-images.mjs
 *
 * Fully automated pipeline:
 * 1. Fetch all templates with broken/missing images from DB
 * 2. Render each workflow JSON as an n8n-style canvas thumbnail
 * 3. Upload PNG to GitHub (edgpac/devhubconnect-images)
 * 4. UPDATE templates SET image_url = '...' WHERE id = N
 *
 * Usage:
 *   GITHUB_TOKEN=ghp_xxx node scripts/auto-generate-images.mjs
 *
 * Options (env vars):
 *   LIMIT=20          — process only first N templates (default: all)
 *   DRY_RUN=1         — render + upload but skip DB update
 *   TEMPLATE_IDS=1,2  — process specific IDs only
 */

import pg       from 'pg';
import { createCanvas } from 'canvas';
import fetch    from 'node-fetch';
import fs       from 'fs';

const { Client } = pg;

// ── Config ────────────────────────────────────────────────────────────────────
const DB_URL     = 'postgresql://postgres:atUkFxuogjjZODArPEnnbgUtSlZZswCe@ballast.proxy.rlwy.net:59419/railway';
const GH_TOKEN   = process.env.GITHUB_TOKEN;
const GH_REPO    = process.env.GH_REPO    || 'edgpac/devhubconnect-images';
const LIMIT      = process.env.LIMIT      ? parseInt(process.env.LIMIT) : null;
const DRY_RUN    = process.env.DRY_RUN    === '1';
const ONLY_IDS   = process.env.TEMPLATE_IDS ? process.env.TEMPLATE_IDS.split(',').map(Number) : null;

const CANVAS_W = 800, CANVAS_H = 384;

if (!GH_TOKEN) {
  console.error('❌  Set GITHUB_TOKEN=ghp_xxx before running');
  process.exit(1);
}

// ── n8n color palette ─────────────────────────────────────────────────────────
const COLORS = {
  manualTrigger:'#FF6D5A', scheduleTrigger:'#FF6D5A', webhook:'#FF6D5A',
  webhookTrigger:'#FF6D5A', cronTrigger:'#FF6D5A',
  gmail:'#EA4335', googleSheets:'#34A853', googleDrive:'#4285F4',
  googleCalendar:'#4285F4', googleDocs:'#4285F4', emailReadImap:'#EA4335',
  slack:'#4A154B', slackTrigger:'#4A154B',
  telegram:'#2CA5E0', discord:'#5865F2', twilio:'#F22F46',
  notion:'#000000', airtable:'#18BFFF', trello:'#0052CC', jira:'#0052CC',
  openAi:'#412991', anthropic:'#C17E3C', lmChatOpenAi:'#412991',
  lmChatAnthropic:'#C17E3C', agent:'#FF6D5A', chainLlm:'#FF6D5A',
  postgres:'#336791', mysql:'#4479A1', mongoDb:'#47A248', redis:'#DC382D',
  code:'#FF9F43', function:'#FF9F43', httpRequest:'#7B68EE',
  if:'#FF6D5A', switch:'#FF6D5A', merge:'#FF6D5A', set:'#FF6D5A',
  wait:'#FF6D5A', splitInBatches:'#FF6D5A',
  stripe:'#6772E5', shopify:'#96BF48', hubspot:'#FF7A59',
  default:'#FF6D5A',
};

const LABELS = {
  manualTrigger:'MT', scheduleTrigger:'⏰', webhook:'WH', webhookTrigger:'WH',
  gmail:'GM', slack:'SL', telegram:'TG', discord:'DC',
  googleSheets:'GS', googleDrive:'GD', notion:'N', airtable:'AT',
  postgres:'PG', mysql:'MY', mongoDb:'MG', redis:'RD',
  openAi:'AI', anthropic:'CL', agent:'AG', chainLlm:'LM',
  httpRequest:'HT', code:'{}', function:'fn', set:'SET',
  if:'IF', switch:'SW', merge:'⋈', wait:'⏳',
  default:'◆',
};

function nodeKey(type) {
  if (!type) return 'default';
  const k = (type.split('.').pop() || '').trim();
  if (COLORS[k]) return k;
  const lk = k.toLowerCase();
  for (const key of Object.keys(COLORS)) {
    if (lk.includes(key.toLowerCase())) return key;
  }
  if (lk.includes('trigger')) return 'webhook';
  if (lk.includes('gmail') || lk.includes('email')) return 'gmail';
  if (lk.includes('slack'))   return 'slack';
  if (lk.includes('openai') || lk.includes('gpt')) return 'openAi';
  if (lk.includes('claude') || lk.includes('anthropic')) return 'anthropic';
  if (lk.includes('sheet'))   return 'googleSheets';
  if (lk.includes('http'))    return 'httpRequest';
  if (lk.includes('code') || lk.includes('function')) return 'code';
  if (lk.includes('if') || lk.includes('switch')) return 'if';
  return 'default';
}

// ── Render workflow to PNG buffer ─────────────────────────────────────────────
function renderWorkflow(wf) {
  const canvas = createCanvas(CANVAS_W, CANVAS_H);
  const ctx    = canvas.getContext('2d');
  const nodes  = wf?.nodes || [];

  // Build edges
  const connections = wf?.connections || {};
  const edges = [];
  for (const [fromName, outputs] of Object.entries(connections)) {
    for (const outputGroup of Object.values(outputs)) {
      if (!Array.isArray(outputGroup)) continue;
      for (const group of outputGroup) {
        if (!group) continue;
        for (const conn of group) {
          if (conn?.node) edges.push({ from: fromName, to: conn.node });
        }
      }
    }
  }

  const NW = 100, NH = 100, PAD = 80;

  const xs = nodes.map(n => n.position?.[0] ?? 0);
  const ys = nodes.map(n => n.position?.[1] ?? 0);
  if (xs.length === 0) xs.push(0), ys.push(0);

  const minX = Math.min(...xs) - PAD;
  const minY = Math.min(...ys) - PAD;
  const maxX = Math.max(...xs) + NW + PAD;
  const maxY = Math.max(...ys) + NH + PAD + 30;
  const srcW = Math.max(maxX - minX, 1);
  const srcH = Math.max(maxY - minY, 1);

  const scale   = Math.min(CANVAS_W / srcW, CANVAS_H / srcH, 1.4);
  const offsetX = (CANVAS_W - srcW * scale) / 2 - minX * scale;
  const offsetY = (CANVAS_H - srcH * scale) / 2 - minY * scale;
  const tx = x => x * scale + offsetX;
  const ty = y => y * scale + offsetY;
  const nw = NW * scale, nh = NH * scale;
  const r  = Math.max(8, 12 * scale);

  // Background
  ctx.fillStyle = '#F5F5F5';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  // dot grid
  const GRID = 24;
  ctx.fillStyle = 'rgba(0,0,0,.07)';
  for (let x = GRID/2; x < CANVAS_W; x += GRID)
    for (let y = GRID/2; y < CANVAS_H; y += GRID) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI*2);
      ctx.fill();
    }

  const nodeMap = {};
  nodes.forEach(n => nodeMap[n.name] = n);

  // Edges
  for (const e of edges) {
    const from = nodeMap[e.from], to = nodeMap[e.to];
    if (!from || !to) continue;
    const fx = tx(from.position?.[0] ?? 0) + nw;
    const fy = ty(from.position?.[1] ?? 0) + nh / 2;
    const ex = tx(to.position?.[0]   ?? 0);
    const ey = ty(to.position?.[1]   ?? 0) + nh / 2;
    const cx = (fx + ex) / 2;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.bezierCurveTo(cx, fy, cx, ey, ex, ey);
    ctx.strokeStyle = 'rgba(0,0,0,.18)';
    ctx.lineWidth   = Math.max(1.5, 2 * scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ex, ey, Math.max(2.5, 4 * scale), 0, Math.PI*2);
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.fill();
  }

  // Nodes
  const labelSize = Math.max(8, Math.round(10 * scale));
  const abbrSize  = Math.max(10, Math.round(15 * scale));

  for (const n of nodes) {
    const x    = tx(n.position?.[0] ?? 0);
    const y    = ty(n.position?.[1] ?? 0);
    const key  = nodeKey(n.type);
    const col  = COLORS[key]  || COLORS.default;
    const abbr = LABELS[key]  || (n.type?.split('.').pop()?.[0]?.toUpperCase() || '?');

    // Shadow
    ctx.shadowColor  = 'rgba(0,0,0,.15)';
    ctx.shadowBlur   = 10 * scale;
    ctx.shadowOffsetY = 3 * scale;

    // Body
    ctx.beginPath();
    ctx.roundRect(x, y, nw, nh, r);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    // Colored top strip
    const stripH = nh * 0.55;
    ctx.beginPath();
    ctx.roundRect(x, y, nw, stripH, [r, r, 0, 0]);
    ctx.fillStyle = col;
    ctx.fill();

    // Abbreviation
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.font = `bold ${abbrSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(abbr, x + nw/2, y + stripH/2);

    // Name
    ctx.fillStyle = '#333';
    ctx.font = `600 ${labelSize}px Arial`;
    const bottomY = y + stripH, bottomH = nh - stripH;
    let label = n.name || (n.type?.split('.').pop() || 'Node');
    const maxW = nw - 8 * scale;
    while (label.length > 2 && ctx.measureText(label).width > maxW) label = label.slice(0,-1);
    ctx.fillText(label, x + nw/2, bottomY + bottomH/2);

    // Connector dots
    const dotR = Math.max(3, 4 * scale);
    [0, nw].forEach(dx => {
      ctx.beginPath();
      ctx.arc(x + dx, y + nh/2, dotR, 0, Math.PI*2);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,.2)';
      ctx.lineWidth = 1.5;
      ctx.fill(); ctx.stroke();
    });

    // Border
    ctx.beginPath();
    ctx.roundRect(x, y, nw, nh, r);
    ctx.strokeStyle = 'rgba(0,0,0,.08)';
    ctx.lineWidth   = 1;
    ctx.stroke();
  }

  // Watermark
  ctx.fillStyle = 'rgba(0,0,0,.12)';
  ctx.font = '600 11px Arial';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('devhubconnect.com', CANVAS_W - 10, CANVAS_H - 8);

  return canvas.toBuffer('image/png');
}

// ── GitHub upload ─────────────────────────────────────────────────────────────
async function uploadToGitHub(filename, pngBuffer) {
  const path   = `images/${filename}`;
  const apiUrl = `https://api.github.com/repos/${GH_REPO}/contents/${path}`;
  const base64 = pngBuffer.toString('base64');

  // Check for existing SHA
  let sha = null;
  try {
    const check = await fetch(apiUrl, {
      headers: { Authorization: `token ${GH_TOKEN}`, Accept: 'application/vnd.github.v3+json' }
    });
    if (check.ok) sha = (await check.json()).sha;
  } catch(_) {}

  const res = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      Authorization: `token ${GH_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `Auto-generate thumbnail: ${filename}`,
      content: base64,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`GitHub ${res.status}: ${err.message}`);
  }

  const data = await res.json();
  return data.content.download_url;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('✅ Connected to DB\n');

  // Load broken image IDs from previous scan
  const BROKEN_IDS = [23,24,31,40,43,45,51,57,64,86,101,105,106,116,119,120,121,122,125,130,131,134,149,151,154,160,164,177,192,203,213,216,228,235,236,247,250,251,252,257,259,264,265,269,278,294,297,300,303,304,306,308,310,311,313,315,317,318,319,321,322,323,324,325,326,327,328,329,330,331,332,334,335,336,338,340,342,343,344,345,346,347,348,349,350,351,352,353,354,355,356,357,358,359,360,361,362,363,364,365,366,367,368,369,370,371,372,373,374,375,376,377,378,379,380,381,382,383,384,385,386,387,388,389,390,391,392,393,394,395,398,400,401,402,403,405,406,407,408,409,410,411,412,414,416,419,420,422,423,424,425,426,427,428,429,430,431,432,435,436,437,439,440,441,442,443,444,445,446,447,448,449,450,451,452,453,454,455,456,458,459,460,461,462,463,464,465,467,468,469,470,471,472,473,475,476,477,478,479,480,481,482,483,484,485,486,487,488,489,490,492,493,494,495,496,497,498,499,500,501,502,503,530,531,532,533,534,535,536,537,538,539,540,541,542,543,544,545,546,547,548,549,550,551,552,553,554,555,556,557,560,562,563,564,565,566,568,569,570,571,572,573,574,575,576,577,578,579,580,581,582,583,584,586,587,588,589,590,591,592,593,594,595,596,597,598,599,600,601,602,603,605,606,607,608,609,610,611,612,613,614,615,616,617,618,619,620,621,622,623,624,625,626,627,628,629,630,631,632,633,634,635,636,637,638,639,640,641,642,643,644,645,646,647,648,649,650,651,652,653,654,655,656,657,658,659,660,661,662,663,664,665,666,667,668,669,671,675,676,677,678,679,680,681,682,683,684,685,686,687,688,691,692,693,694,695,696,697,698,699,700,701,702,703,704];

  const targetIds = ONLY_IDS || BROKEN_IDS;
  const ids = LIMIT ? targetIds.slice(0, LIMIT) : targetIds;

  console.log(`📋 Processing ${ids.length} templates${DRY_RUN ? ' (DRY RUN — DB not updated)' : ''}...\n`);

  const { rows } = await client.query(
    `SELECT id, name, workflow_json FROM templates WHERE id = ANY($1) ORDER BY id`,
    [ids]
  );

  let ok = 0, failed = 0;
  const errors = [];

  for (const row of rows) {
    const filename = `template-${row.id}.png`;
    process.stdout.write(`[${row.id}] ${row.name.slice(0, 50).padEnd(50)} … `);

    try {
      // Render
      const wf  = row.workflow_json || {};
      const png = renderWorkflow(wf);

      // Upload
      const rawUrl = await uploadToGitHub(filename, png);

      // Update DB
      if (!DRY_RUN) {
        await client.query('UPDATE templates SET image_url = $1 WHERE id = $2', [rawUrl, row.id]);
      }

      console.log(`✅ ${rawUrl}`);
      ok++;

      // Small delay to avoid GitHub rate limit
      await new Promise(r => setTimeout(r, 300));
    } catch(e) {
      console.log(`❌ ${e.message}`);
      failed++;
      errors.push({ id: row.id, name: row.name, error: e.message });
    }
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`✅ Success : ${ok}`);
  console.log(`❌ Failed  : ${failed}`);
  if (DRY_RUN) console.log(`ℹ️  Dry run — no DB changes made`);

  if (errors.length > 0) {
    fs.writeFileSync('scripts/failed-images.json', JSON.stringify(errors, null, 2));
    console.log(`\nFailed list saved to scripts/failed-images.json`);
  }

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
