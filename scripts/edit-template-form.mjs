/**
 * edit-template-form.mjs
 *
 * Uses Playwright to log into the DevHubConnect website as admin and
 * update template title, description, and meta_description via the UI form.
 *
 * Usage:
 *   SITE_URL=https://your-site.railway.app \
 *   ADMIN_EMAIL=you@example.com \
 *   ADMIN_PASSWORD=yourpassword \
 *   node scripts/edit-template-form.mjs
 *
 * Or with inline UPDATES array edited below for bulk editing.
 *
 * Env vars:
 *   SITE_URL       — base URL of the DevHubConnect site
 *   ADMIN_EMAIL    — admin account email
 *   ADMIN_PASSWORD — admin account password
 *   DRY_RUN=true   — navigate and fill but do not submit
 */

import { chromium } from 'playwright';

const SITE_URL      = process.env.SITE_URL      || 'http://localhost:3000';
const ADMIN_EMAIL   = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DRY_RUN       = process.env.DRY_RUN === 'true';

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('❌ Set ADMIN_EMAIL and ADMIN_PASSWORD env vars');
  process.exit(1);
}

// ── Templates to update ───────────────────────────────────────────────────────
// Edit this array to specify which templates to update and what to change.
// Any field left as null/undefined will be skipped (not overwritten).
const UPDATES = [
  // Example — uncomment and fill in:
  // {
  //   id: 169,
  //   name: 'DevHubConnect - Cortex Security Analysis with Claude AI Threat Assessment',
  //   description: 'Updated description here...',
  //   meta_description: 'Short SEO description...',
  // },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fillField(page, selectors, value) {
  if (value === null || value === undefined) return false;
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if (await el.count() > 0) {
      await el.click({ clickCount: 3 }); // select all
      await el.fill(value);
      return true;
    }
  }
  return false;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page    = await context.newPage();

// ── 1. Log in ─────────────────────────────────────────────────────────────────
console.log('🔐 Logging in...');
await page.goto(`${SITE_URL}/signin`, { waitUntil: 'networkidle' });
await page.locator('input[type="email"], input[name="email"]').first().fill(ADMIN_EMAIL);
await page.locator('input[type="password"]').first().fill(ADMIN_PASSWORD);
await page.locator('button[type="submit"], button').filter({ hasText: /sign in|log in/i }).first().click();
await page.waitForURL(url => !url.includes('/signin'), { timeout: 15000 });
console.log('✅ Logged in\n');

// ── 2. Process each update ────────────────────────────────────────────────────
const results = { success: 0, failed: 0 };

for (const update of UPDATES) {
  const label = `[${update.id}]`;
  try {
    // Try common admin edit URL patterns
    const editUrls = [
      `${SITE_URL}/admin/templates/${update.id}/edit`,
      `${SITE_URL}/admin/templates/${update.id}`,
      `${SITE_URL}/templates/${update.id}/edit`,
    ];

    let landed = false;
    for (const url of editUrls) {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      // Check if we got a form
      const hasForm = await page.locator('form, input[name="name"], textarea[name="description"]').count() > 0;
      if (hasForm) { landed = true; break; }
    }

    if (!landed) {
      // Try finding an edit button on the template detail page
      await page.goto(`${SITE_URL}/templates/${update.id}`, { waitUntil: 'networkidle' });
      const editBtn = page.locator('a, button').filter({ hasText: /edit/i }).first();
      if (await editBtn.count() > 0) {
        await editBtn.click();
        await page.waitForLoadState('networkidle');
        landed = true;
      }
    }

    if (!landed) throw new Error('Could not find edit form');

    // ── Fill fields ──────────────────────────────────────────────────────────
    const filled = [];

    if (update.name) {
      const ok = await fillField(page, [
        'input[name="name"]', 'input[placeholder*="title" i]', 'input[placeholder*="name" i]',
        '[data-field="name"] input', '#name', '#title',
      ], update.name);
      if (ok) filled.push('name');
    }

    if (update.description) {
      const ok = await fillField(page, [
        'textarea[name="description"]', '[data-field="description"] textarea',
        'textarea[placeholder*="description" i]', '#description',
      ], update.description);
      if (ok) filled.push('description');
    }

    if (update.meta_description) {
      const ok = await fillField(page, [
        'textarea[name="meta_description"]', 'input[name="meta_description"]',
        '[data-field="meta_description"] input', '#meta_description',
        'input[placeholder*="meta" i]', 'textarea[placeholder*="meta" i]',
      ], update.meta_description);
      if (ok) filled.push('meta_description');
    }

    if (filled.length === 0) throw new Error('No fields matched on the page');

    // ── Submit ───────────────────────────────────────────────────────────────
    if (DRY_RUN) {
      console.log(`🔵 DRY_RUN ${label} — would update: ${filled.join(', ')}`);
    } else {
      const saveBtn = page.locator('button[type="submit"], button').filter({ hasText: /save|update|submit/i }).first();
      if (await saveBtn.count() === 0) throw new Error('Save button not found');
      await saveBtn.click();
      await page.waitForLoadState('networkidle');
      console.log(`✅ ${label} Updated: ${filled.join(', ')}`);
    }

    results.success++;
  } catch (err) {
    console.error(`❌ ${label} — ${err.message}`);
    results.failed++;
  }
}

await browser.close();

console.log(`\n════════════════════════════════`);
console.log(`SUMMARY`);
console.log(`  ✅ Success : ${results.success}`);
console.log(`  ❌ Failed  : ${results.failed}`);
if (DRY_RUN) console.log('\n[DRY RUN] No changes submitted.');
if (UPDATES.length === 0) console.log('\n⚠️  UPDATES array is empty — add entries to scripts/edit-template-form.mjs to use this script.');
