// One-shot additive schema sync for the Shiprocket integration: adds shipping
// linkage columns + indexes to `orders`, a `weightGrams` column to `products`,
// and widens the `orders.status` enum with courier-level checkpoints. Mirrors
// scripts/migrate-add-haveli.mjs — idempotent, safe to rerun.
// Usage: node scripts/migrate-add-shiprocket.mjs
import 'dotenv/config';
import mysql from 'mysql2/promise';

const ORDER_COLUMNS = [
  { name: 'shiprocketOrderId',    ddl: 'varchar(50) NULL' },
  { name: 'shiprocketShipmentId', ddl: 'varchar(50) NULL' },
  { name: 'awbNumber',            ddl: 'varchar(50) NULL' },
  { name: 'courierName',          ddl: 'varchar(100) NULL' },
  { name: 'trackingUrl',          ddl: 'varchar(500) NULL' },
  { name: 'shiprocketStatus',     ddl: 'varchar(100) NULL' },
  { name: 'shippedAt',            ddl: 'datetime NULL' },
  { name: 'shiprocketPushError',  ddl: 'text NULL' },
];

const PRODUCT_COLUMNS = [
  { name: 'weightGrams', ddl: 'int NULL' },
];

const ORDER_INDEXES = [
  { name: 'order_shiprocket_order_idx', ddl: 'CREATE INDEX order_shiprocket_order_idx ON orders (shiprocketOrderId)' },
  { name: 'order_awb_idx',              ddl: 'CREATE INDEX order_awb_idx ON orders (awbNumber)' },
];

const NEW_STATUS_ENUM = "ENUM('PENDING','CONFIRMED','PROCESSING','SHIPPED','OUT_FOR_DELIVERY','DELIVERED','RTO_INITIATED','RTO_DELIVERED','CANCELLED','REFUNDED')";

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

async function addIndexes(conn, table, indexes) {
  const [existing] = await conn.execute(
    `SELECT DISTINCT index_name AS name FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [table],
  );
  const have = new Set(existing.map((r) => r.name));

  for (const idx of indexes) {
    if (have.has(idx.name)) {
      console.log(`skip   index ${idx.name} (already exists)`);
      continue;
    }
    console.log(`run    ${idx.ddl}`);
    await conn.execute(idx.ddl);
  }
}

const conn = await mysql.createConnection(process.env.DATABASE_URL);
try {
  await addColumns(conn, 'orders', ORDER_COLUMNS);
  await addColumns(conn, 'products', PRODUCT_COLUMNS);
  await addIndexes(conn, 'orders', ORDER_INDEXES);

  // Widen the status enum (safe: strictly a superset, no existing row holds a
  // value outside the new list, so this is idempotent to rerun).
  const sql = `ALTER TABLE orders MODIFY COLUMN status ${NEW_STATUS_ENUM} NOT NULL DEFAULT 'PENDING'`;
  console.log(`run    ${sql}`);
  await conn.execute(sql);

  const [orderCols] = await conn.execute('SHOW COLUMNS FROM orders');
  console.log(`\norders now has ${orderCols.length} columns: ${orderCols.map((c) => c.Field).join(', ')}`);
  const [productCols] = await conn.execute('SHOW COLUMNS FROM products');
  console.log(`products now has ${productCols.length} columns: ${productCols.map((c) => c.Field).join(', ')}`);
  console.log('Migration complete.');
} finally {
  await conn.end();
}
