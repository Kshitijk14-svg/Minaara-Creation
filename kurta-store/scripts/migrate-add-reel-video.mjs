// One-shot additive schema sync: adds the reelVideoUrl / reelVideoPosterUrl /
// reelVideoUpdatedAt columns to products that drizzle's schema.ts defines but
// the live DB may be missing. Idempotent — safe to rerun.
// Usage: node scripts/migrate-add-reel-video.mjs
// Bare `dotenv/config` only loads `.env`, not `.env.local` — but production
// (per OVH-deploy.md) keeps everything in .env.local. Load both, mirroring
// Next.js's own precedence (.env.local wins; dotenv's config() never
// overrides a var that's already set, so calling .env.local first is enough).
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();
import mysql from 'mysql2/promise';

const NEW_COLUMNS = [
  { name: 'reelVideoUrl', ddl: 'varchar(500) NULL' },
  { name: 'reelVideoPosterUrl', ddl: 'varchar(500) NULL' },
  { name: 'reelVideoUpdatedAt', ddl: 'datetime NULL' },
];

const conn = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const [existing] = await conn.execute(
    `SELECT column_name AS name FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'products'`,
  );
  const have = new Set(existing.map((r) => r.name));

  for (const col of NEW_COLUMNS) {
    if (have.has(col.name)) {
      console.log(`skip   products.${col.name} (already exists)`);
      continue;
    }
    const sql = `ALTER TABLE products ADD COLUMN ${col.name} ${col.ddl}`;
    console.log(`run    ${sql}`);
    await conn.execute(sql);
  }

  const [cols] = await conn.execute('SHOW COLUMNS FROM products');
  console.log(`\nproducts now has ${cols.length} columns: ${cols.map((c) => c.Field).join(', ')}`);
  console.log('Migration complete.');
} finally {
  await conn.end();
}
