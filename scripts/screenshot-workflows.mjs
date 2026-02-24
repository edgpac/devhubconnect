/**
 * screenshot-workflows.mjs
 *
 * For each template in the DB:
 *   1. Import workflow JSON into local n8n via API key
 *   2. Screenshot the canvas in DARK MODE with Playwright
 *   3. Upload PNG to GitHub (edgpac/devhubconnect-images)
 *   4. Update DB image_url
 *   5. Delete workflow from n8n (cleanup)
 *
 * Usage:
 *   N8N_EMAIL=you@example.com N8N_PASSWORD=pass GITHUB_TOKEN=ghp_xxx \
 *   node scripts/screenshot-workflows.mjs
 *
 * Optional:
 *   LIMIT=10           only process first N templates
 *   TEMPLATE_IDS=11,12 specific IDs only
 *   DRY_RUN=true       skip GitHub upload and DB update
 */

import { chromium } from 'playwright';
import pg from 'pg';
import fs from 'fs';

const { Client } = pg;

const N8N_URL      = process.env.N8N_URL      || 'http://localhost:5678';
const N8N_EMAIL    = process.env.N8N_EMAIL;
const N8N_PASSWORD = process.env.N8N_PASSWORD;
const N8N_API_KEY  = process.env.N8N_API_KEY; // from Settings → API in n8n UI
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GH_REPO      = process.env.GH_REPO      || 'edgpac/devhubconnect-images';
const LIMIT        = process.env.LIMIT        ? parseInt(process.env.LIMIT) : Infinity;
const DRY_RUN      = process.env.DRY_RUN === 'true';

if (!N8N_EMAIL || !N8N_PASSWORD) {
  console.error('❌ Set N8N_EMAIL and N8N_PASSWORD env vars'); process.exit(1);
}
if (!N8N_API_KEY) {
  console.error('❌ Set N8N_API_KEY env var.');
  console.error('   → Go to http://localhost:5678/settings/api → Create API Key → copy it');
  process.exit(1);
}
if (!GITHUB_TOKEN && !DRY_RUN) {
  console.error('❌ Set GITHUB_TOKEN env var (or DRY_RUN=true)'); process.exit(1);
}

const DB = new Client({
  connectionString: 'postgresql://postgres:atUkFxuogjjZODArPEnnbgUtSlZZswCe@ballast.proxy.rlwy.net:59419/railway',
  ssl: { rejectUnauthorized: false },
});

// ─── GitHub ──────────────────────────────────────────────────────────────────
async function uploadToGitHub(filename, pngBuffer) {
  const filePath = `images/${filename}`;
  const apiUrl   = `https://api.github.com/repos/${GH_REPO}/contents/${filePath}`;
  const base64   = pngBuffer.toString('base64');

  const checkRes = await fetch(apiUrl, {
    headers: { Authorization: `token ${GITHUB_TOKEN}`, 'User-Agent': 'dhc-screenshotter' }
  });
  const sha = checkRes.ok ? (await checkRes.json()).sha : undefined;

  const res = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'dhc-screenshotter',
    },
    body: JSON.stringify({ message: `wf screenshot ${filename}`, content: base64, ...(sha ? { sha } : {}) }),
  });
  if (!res.ok) throw new Error(`GitHub: ${res.status} ${await res.text()}`);
  return `https://cdn.jsdelivr.net/gh/${GH_REPO}@main/${filePath}`;
}

// ─── n8n REST API (uses API key) ─────────────────────────────────────────────
async function n8nRequest(path, options = {}) {
  const res = await fetch(`${N8N_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-N8N-API-KEY': N8N_API_KEY,
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

function sanitizeNode(node) {
  // n8n API v1 only accepts these node fields — strip everything else
  const allowed = ['id','name','type','typeVersion','position','parameters',
    'credentials','disabled','notes','notesInFlow','executeOnce',
    'alwaysOutputData','retryOnFail','maxTries','waitBetweenTries',
    'onError','continueOnFail'];
  return Object.fromEntries(
    Object.entries(node).filter(([k]) => allowed.includes(k))
  );
}

async function createWorkflow(workflowJson) {
  const res = await n8nRequest('/api/v1/workflows', {
    method: 'POST',
    body: JSON.stringify({
      name: workflowJson.name || 'DHC Screenshot',
      nodes: (workflowJson.nodes || []).map(sanitizeNode),
      connections: workflowJson.connections || {},
      settings: { executionOrder: 'v1' },
      staticData: null,
    }),
  });
  if (!res.ok) throw new Error(`Create failed ${res.status}: ${JSON.stringify(res.data).slice(0, 200)}`);
  return res.data.id || res.data.data?.id;
}

async function deleteWorkflow(wfId) {
  await n8nRequest(`/api/v1/workflows/${wfId}`, { method: 'DELETE' });
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  await DB.connect();
  console.log('✅ DB connected\n');

  // Fetch templates
  let rows;
  if (process.env.TEMPLATE_IDS) {
    const ids = process.env.TEMPLATE_IDS.split(',').map(Number);
    ({ rows } = await DB.query(
      `SELECT id, name, workflow_json FROM templates WHERE id = ANY($1::int[]) ORDER BY id`, [ids]
    ));
  } else {
    ({ rows } = await DB.query(`SELECT id, name, workflow_json FROM templates ORDER BY id`));
  }
  if (LIMIT < Infinity) rows = rows.slice(0, LIMIT);
  console.log(`📦 ${rows.length} templates to process\n`);

  // ── Launch browser and log in ──
  const browser = await chromium.launch({ headless: false });
  // 1280×720 viewport + deviceScaleFactor 2 = 2560×1440 output (2K) — nodes are readable
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  const page = await context.newPage();

  console.log('🔐 Logging into n8n...');
  await page.goto(`${N8N_URL}/signin`, { waitUntil: 'networkidle' });
  await page.locator('input[type="email"], .el-input__inner').first().fill(N8N_EMAIL);
  await page.locator('input[type="password"]').first().fill(N8N_PASSWORD);
  await page.locator('button').filter({ hasText: /sign in/i }).first().click();
  await page.waitForURL(`${N8N_URL}/home/workflows`, { timeout: 20000 });
  console.log('✅ Logged in\n');

  console.log(`✅ Using API key (${N8N_API_KEY.slice(0, 8)}...)\n`);

  // ── Set dark mode via localStorage ──
  await page.evaluate(() => {
    localStorage.setItem('N8N_THEME', 'dark');
  });

  // ── Process each template ──
  const results = { success: 0, failed: 0, skipped: 0 };
  const failures = [];

  for (let i = 0; i < rows.length; i++) {
    const { id, name, workflow_json } = rows[i];
    const label = `[${i + 1}/${rows.length}] id=${id} "${name}"`;

    try {
      const wf = typeof workflow_json === 'string' ? JSON.parse(workflow_json) : workflow_json;

      if (!wf || !Array.isArray(wf.nodes) || wf.nodes.length === 0) {
        console.log(`⚠️  ${label} — no nodes, skipping`);
        results.skipped++;
        continue;
      }

      // Create in n8n
      const wfId = await createWorkflow(wf);

      // Open in browser
      await page.goto(`${N8N_URL}/workflow/${wfId}`, { waitUntil: 'networkidle', timeout: 30000 });

      // Hide all banners/warnings/headers, keep only the canvas
      await page.evaluate(() => {
        localStorage.setItem('N8N_THEME', 'dark');
        document.documentElement.setAttribute('data-theme', 'dark');
        document.documentElement.classList.add('dark');
        // Hide upgrade banners, toast notifications, top nav, sidebars
        const hide = [
          '.el-notification',           // ← the "Critical update available" toast
          '.el-notification-fade',
          '#notification_1',
          '[data-test-id="banner-stack"]',
          '.banner-stack',
          '.n8n-info-tip',
          '[class*="bannerStack"]',
          '[class*="upgradeModal"]',
          'header',
          '[data-test-id="main-header"]',
          '[class*="mainHeader"]',
          '[class*="MainHeader"]',
          'aside',
          '[data-test-id="workflow-lm-chat-button"]',
        ];
        hide.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => { el.style.display = 'none'; });
        });
      });

      // Belt-and-suspenders: inject CSS to nuke any notification/banner
      await page.addStyleTag({ content: `
        .el-notification, .el-notification-fade, [id^="notification_"],
        header, aside, [class*="mainHeader"], [class*="bannerStack"],
        [data-test-id="main-header"], [data-test-id="banner-stack"],
        [data-test-id="workflow-lm-chat-button"] {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
      ` });

      // Wait for nodes to render
      await page.waitForSelector('.vue-flow__node, [data-test-id="canvas-node"]', { timeout: 12000 })
        .catch(() => {});
      await page.waitForTimeout(1500);

      // Click "Tidy Up" (sweep icon) to auto-arrange nodes so they aren't bunched up
      try {
        const tidyBtn = page.locator('[data-test-id="tidy-up-button"], [title="Tidy Up"], button[aria-label*="Tidy" i]');
        if (await tidyBtn.count() > 0) {
          await tidyBtn.first().click();
          await page.waitForTimeout(600);
          // Click twice — first click selects all, second arranges
          await tidyBtn.first().click();
          await page.waitForTimeout(800);
          // Click the canvas center to deselect/blur the button (removes red active state)
          await page.mouse.click(640, 360);
          await page.waitForTimeout(400);
        }
      } catch (_) {} // non-fatal — screenshot still happens

      // Fit all nodes in view after arrangement
      await page.keyboard.press('Shift+1');
      await page.waitForTimeout(800);

      // Screenshot only the vue-flow canvas element (pure workflow, no chrome)
      const screenshotPath = `/tmp/wf-${id}-${Date.now()}.jpg`;
      const canvasEl = await page.$('.vue-flow__pane') ||
                       await page.$('[data-test-id="canvas"]') ||
                       await page.$('#workflow-canvas') ||
                       await page.$('.vue-flow');

      if (canvasEl) {
        const box = await canvasEl.boundingBox();
        await page.screenshot({ path: screenshotPath, type: 'jpeg', quality: 85, clip: box || undefined, fullPage: false });
      } else {
        await page.addStyleTag({ content: `
          header, aside, [class*="mainHeader"], [class*="bannerStack"],
          [data-test-id="main-header"], [data-test-id="banner-stack"] {
            display: none !important;
          }
          body { overflow: hidden; }
        ` });
        await page.screenshot({ path: screenshotPath, type: 'jpeg', quality: 85, fullPage: false });
      }

      const pngBuffer = fs.readFileSync(screenshotPath);
      fs.unlinkSync(screenshotPath);

      if (DRY_RUN) {
        console.log(`🔵 DRY_RUN ${label}`);
      } else {
        const imageUrl = await uploadToGitHub(`wf-${id}.jpg`, pngBuffer);
        await DB.query('UPDATE templates SET image_url = $1 WHERE id = $2', [imageUrl, id]);
        console.log(`✅ ${label}\n   → ${imageUrl}`);
      }

      await deleteWorkflow(wfId);
      results.success++;

    } catch (err) {
      console.error(`❌ ${label} — ${err.message}`);
      failures.push({ id, name, error: err.message });
      results.failed++;
      await page.waitForTimeout(1000);
    }
  }

  console.log('\n════════════════════════════════');
  console.log('SUMMARY');
  console.log(`  ✅ Success : ${results.success}`);
  console.log(`  ❌ Failed  : ${results.failed}`);
  console.log(`  ⏭️  Skipped : ${results.skipped}`);
  if (failures.length) {
    console.log('\nFailed:');
    failures.forEach(f => console.log(`  id=${f.id} "${f.name}" — ${f.error}`));
  }

  await browser.close();
  await DB.end();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
