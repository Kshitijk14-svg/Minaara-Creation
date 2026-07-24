// One-shot additive schema sync for Cash-on-Delivery: adds orders.codAdvanceINR
// (the fixed advance actually collected online for a COD order) and widens
// orders.paymentStatus with COD_PENDING (advance paid, balance due on
// delivery). Mirrors scripts/migrate-add-shiprocket.mjs — idempotent, safe to
// rerun.
// Usage: node scripts/migrate-add-cod.mjs
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();
import mysql from 'mysql2/promise';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Checked .env.local and .env in the current directory (' + process.cwd() + ').');
  process.exit(1);
}

const ORDER_COLUMNS = [
  { name: 'codAdvanceINR', ddl: 'double NOT NULL DEFAULT 0' },
];

const NEW_PAYMENT_STATUS_ENUM = "ENUM('PENDING','PAID','FAILED','REFUNDED','COD_PENDING')";

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

const conn = await mysql.createConnection(process.env.DATABASE_URL);
try {
  await addColumns(conn, 'orders', ORDER_COLUMNS);

  // Widen the paymentStatus enum (safe: strictly a superset, no existing row
  // holds a value outside the new list, so this is idempotent to rerun).
  const sql = `ALTER TABLE orders MODIFY COLUMN paymentStatus ${NEW_PAYMENT_STATUS_ENUM} NOT NULL DEFAULT 'PENDING'`;
  console.log(`run    ${sql}`);
  await conn.execute(sql);

  const [orderCols] = await conn.execute('SHOW COLUMNS FROM orders');
  console.log(`\norders now has ${orderCols.length} columns: ${orderCols.map((c) => c.Field).join(', ')}`);
  console.log('Migration complete.');
} finally {
  await conn.end();
}
