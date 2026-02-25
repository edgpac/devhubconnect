#!/usr/bin/env node
/**
 * migrate-add-dhc-tags.mjs
 * Backfills meta.instanceId and the 'devhubconnect' tag into all existing
 * templates whose workflow_json is missing either field.
 *
 * Usage:
 *   node scripts/migrate-add-dhc-tags.mjs           # dry run (safe preview)
 *   node scripts/migrate-add-dhc-tags.mjs --live     # actually write to DB
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { Pool } = require('/Users/edgartamarind/Downloads/automations/node_modules/pg');

const DATABASE_URL = 'postgresql://postgres:atUkFxuogjjZODArPEnnbgUtSlZZswCe@ballast.proxy.rlwy.net:59419/railway';
const isLive = process.argv.includes('--live');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
});

async function main() {
  console.log('\n🔧 DHC Tag Migration');
  console.log(`   Mode: ${isLive ? '⚠️  LIVE (will write to DB)' : 'DRY RUN (read-only preview)'}\n`);

  const client = await pool.connect();

  try {
    const { rows: templates } = await client.query(
      'SELECT id, name, workflow_json FROM templates ORDER BY id'
    );
    console.log(`📦 Total templates in DB: ${templates.length}\n`);

    const toFix = [];

    for (const t of templates) {
      let wf = t.workflow_json;
      if (typeof wf === 'string') {
        try { wf = JSON.parse(wf); } catch { continue; }
      }
      if (!wf || typeof wf !== 'object') continue;

      const needsInstanceId = !wf.meta?.instanceId;
      const needsTag = !Array.isArray(wf.tags) || !wf.tags.includes('devhubconnect');

      if (needsInstanceId || needsTag) {
        toFix.push({ id: t.id, name: t.name, wf, needsInstanceId, needsTag });
      }
    }

    console.log(`🔍 Need patching: ${toFix.length} templates`);
    if (toFix.length === 0) {
      console.log('✅ All templates already have meta.instanceId and devhubconnect tag.');
      return;
    }

    console.log('\nSample (first 10):');
    toFix.slice(0, 10).forEach(t =>
      console.log(`  [${t.id}] ${t.name.slice(0, 60)} — ${[
        t.needsInstanceId ? 'missing instanceId' : '',
        t.needsTag ? 'missing tag' : '',
      ].filter(Boolean).join(', ')}`)
    );
    if (toFix.length > 10) console.log(`  ... and ${toFix.length - 10} more`);

    if (!isLive) {
      console.log('\n(Dry run — no changes made. Add --live to apply.)\n');
      return;
    }

    console.log('\n✍️  Applying patches...');
    let updated = 0;
    let failed = 0;

    for (const t of toFix) {
      try {
        const wf = t.wf;

        // Inject instanceId
        if (t.needsInstanceId) {
          wf.meta = { ...(wf.meta || {}), instanceId: 'devhubconnect' };
        }

        // Inject tag
        if (t.needsTag) {
          wf.tags = [...new Set([...(wf.tags || []), 'devhubconnect'])];
        }

        await client.query(
          'UPDATE templates SET workflow_json = $1 WHERE id = $2',
          [JSON.stringify(wf), t.id]
        );
        updated++;
        process.stdout.write(`\r  Updated ${updated}/${toFix.length}...`);
      } catch (err) {
        console.error(`\n  ❌ Failed on id=${t.id}: ${err.message}`);
        failed++;
      }
    }

    console.log(`\n\n✅ Updated: ${updated}`);
    if (failed) console.log(`❌ Failed:  ${failed}`);
    console.log(`📦 Total patched: ${updated}/${toFix.length}`);
    console.log('\nDone. Templates can now be downloaded and imported into Studio.\n');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('\n💥 Fatal:', err.message);
  process.exit(1);
});
