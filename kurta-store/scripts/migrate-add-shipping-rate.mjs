// One-shot additive schema sync: adds `shippingINR` to `orders` so the real,
// per-order delivery charge (flat fallback or live Shiprocket rate — see
// getShippingRateINR in src/lib/shiprocket.ts) is persisted instead of being
// silently dropped from the stored total. Mirrors scripts/migrate-add-shiprocket.mjs
// — idempotent, safe to rerun.
// Usage: node scripts/migrate-add-shipping-rate.mjs
// Bare `dotenv/config` only loads `.env`, not `.env.local` — but production
// (per OVH-deploy.md) keeps everything in `.env.local`. Load both, mirroring
// Next.js's own precedence (.env.local wins; dotenv's config() never
// overrides a var that's already set, so calling .env.local first is enough).
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();
import mysql from 'mysql2/promise';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Checked .env.local and .env in the current directory (' + process.cwd() + ').');
  process.exit(1);
}

const ORDER_COLUMNS = [
  { name: 'shippingINR', ddl: "double NOT NULL DEFAULT 0" },
];

async function addColumns(conn, table, columns) {
  const [existing] = await conn.execute(
    `SELECT column_name AS name FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [table],
  );
  const have = new Set(existing.map((r) => r.name));

  for (const col of columns) {
    if (have.has(col.name)) {
      console.log(`skip   ${table}.${col.name} (already exists)`);
      continue;
    }
    const sql = `ALTER TABLE ${table} ADD COLUMN ${col.name} ${col.ddl}`;
    console.log(`run    ${sql}`);
    await conn.execute(sql);
  }
}

// Backfill existing paid orders: their totalAmountINR was previously stored
// as subtotal - discount (shipping silently dropped). We can't recover the
// exact historical shipping charge, so leave shippingINR at its default 0 for
// pre-existing rows — only newly created orders will populate it correctly.

const conn = await mysql.createConnection(process.env.DATABASE_URL);
try {
  await addColumns(conn, 'orders', ORDER_COLUMNS);

  const [orderCols] = await conn.execute('SHOW COLUMNS FROM orders');
  console.log(`\norders now has ${orderCols.length} columns: ${orderCols.map((c) => c.Field).join(', ')}`);
  console.log('Migration complete.');
} finally {
  await conn.end();
}
