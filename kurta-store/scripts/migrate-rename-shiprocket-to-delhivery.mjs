// One-shot rename migration for the Shiprocket → Delhivery courier swap:
// renames the Shiprocket-branded linkage columns on `orders` to their
// Delhivery equivalents (type/nullability unchanged) and renames the
// matching index. Already-generic columns (awbNumber, courierName,
// trackingUrl, shippedAt) are untouched. Mirrors migrate-add-shiprocket.mjs
// — idempotent, safe to rerun.
// Usage: node scripts/migrate-rename-shiprocket-to-delhivery.mjs
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

const ORDER_COLUMN_RENAMES = [
  { from: 'shiprocketOrderId',    to: 'delhiveryOrderId',    ddl: 'varchar(50) NULL' },
  { from: 'shiprocketShipmentId', to: 'delhiveryShipmentId', ddl: 'varchar(50) NULL' },
  { from: 'shiprocketStatus',     to: 'delhiveryStatus',     ddl: 'varchar(100) NULL' },
  { from: 'shiprocketPushError',  to: 'delhiveryPushError',  ddl: 'text NULL' },
];

const ORDER_INDEX_RENAMES = [
  { from: 'order_shiprocket_order_idx', to: 'order_delhivery_order_idx' },
];

async function renameColumns(conn, table, renames) {
  const [existing] = await conn.execute(
    `SELECT column_name AS name FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [table],
  );
  const have = new Set(existing.map((r) => r.name));

  for (const col of renames) {
    if (have.has(col.to)) {
      console.log(`skip   ${table}.${col.from} -> ${col.to} (already renamed)`);
      continue;
    }
    if (!have.has(col.from)) {
      console.log(`skip   ${table}.${col.from} -> ${col.to} (source column not found)`);
      continue;
    }
    const sql = `ALTER TABLE ${table} CHANGE COLUMN ${col.from} ${col.to} ${col.ddl}`;
    console.log(`run    ${sql}`);
    await conn.execute(sql);
  }
}

async function renameIndexes(conn, table, renames) {
  const [existing] = await conn.execute(
    `SELECT DISTINCT index_name AS name FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [table],
  );
  const have = new Set(existing.map((r) => r.name));

  for (const idx of renames) {
    if (have.has(idx.to)) {
      console.log(`skip   index ${idx.from} -> ${idx.to} (already renamed)`);
      continue;
    }
    if (!have.has(idx.from)) {
      console.log(`skip   index ${idx.from} -> ${idx.to} (source index not found)`);
      continue;
    }
    const sql = `ALTER TABLE ${table} RENAME INDEX ${idx.from} TO ${idx.to}`;
    console.log(`run    ${sql}`);
    await conn.execute(sql);
  }
}

const conn = await mysql.createConnection(process.env.DATABASE_URL);
try {
  await renameColumns(conn, 'orders', ORDER_COLUMN_RENAMES);
  await renameIndexes(conn, 'orders', ORDER_INDEX_RENAMES);

  const [orderCols] = await conn.execute('SHOW COLUMNS FROM orders');
  console.log(`\norders now has ${orderCols.length} columns: ${orderCols.map((c) => c.Field).join(', ')}`);
  console.log('Migration complete.');
} finally {
  await conn.end();
}
