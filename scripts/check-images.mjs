import pg from 'pg';

const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres:atUkFxuogjjZODArPEnnbgUtSlZZswCe@ballast.proxy.rlwy.net:59419/railway',
  ssl: { rejectUnauthorized: false },
});

async function checkUrl(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
    return res.status;
  } catch {
    return 0; // network error / timeout
  }
}

async function main() {
  await client.connect();
  console.log('Connected. Fetching all image URLs...\n');

  const { rows } = await client.query(
    `SELECT id, name, image_url FROM templates WHERE image_url IS NOT NULL AND image_url != '' ORDER BY id`
  );

  console.log(`Checking ${rows.length} image URLs (batches of 20)...\n`);

  const broken = [];
  const BATCH = 20;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (row) => {
        const status = await checkUrl(row.image_url);
        return { ...row, status };
      })
    );

    for (const r of results) {
      if (r.status !== 200) {
        broken.push(r);
        console.log(`❌ [${r.status}] id=${r.id}  ${r.name}`);
        console.log(`        ${r.image_url}\n`);
      }
    }

    process.stdout.write(`Progress: ${Math.min(i + BATCH, rows.length)}/${rows.length}\r`);
  }

  console.log(`\n\n=== SUMMARY ===`);
  console.log(`Total checked : ${rows.length}`);
  console.log(`Broken        : ${broken.length}`);
  console.log(`OK            : ${rows.length - broken.length}`);

  if (broken.length > 0) {
    console.log('\n=== SQL to NULL out broken URLs (run after fixing) ===');
    const ids = broken.map(r => r.id).join(', ');
    console.log(`-- Templates with broken images: ${ids}`);
    console.log(`SELECT id, name, image_url FROM templates WHERE id IN (${ids}) ORDER BY id;`);
  }

  await client.end();
}

main().catch(err => { console.error(err); process.exit(1); });
