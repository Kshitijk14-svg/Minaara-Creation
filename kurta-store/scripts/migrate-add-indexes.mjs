// One-shot additive schema sync: adds the user_role_created_idx / variant_stock_idx /
// order_gateway_unique indexes that schema.ts defines but the live DB may be missing
// (drizzle-kit push is interactive and blocked in this sandbox). Idempotent — safe to rerun.
// Usage: node scripts/migrate-add-indexes.mjs
import 'dotenv/config';
import mysql from 'mysql2/promise';

const NEW_INDEXES = [
  {
    table: 'users',
    name: 'user_role_created_idx',
    ddl: 'ALTER TABLE users ADD INDEX user_role_created_idx (role, createdAt)',
  },
  {
    table: 'product_size_variants',
    name: 'variant_stock_idx',
    ddl: 'ALTER TABLE product_size_variants ADD INDEX variant_stock_idx (stock)',
  },
  {
    table: 'orders',
    name: 'order_gateway_unique',
    ddl: 'ALTER TABLE orders ADD UNIQUE INDEX order_gateway_unique (paymentGatewayId)',
  },
];

const conn = await mysql.createConnection(process.env.DATABASE_URL);
try {
  for (const idx of NEW_INDEXES) {
    const [existing] = await conn.execute(
      `SELECT DISTINCT INDEX_NAME AS name FROM information_schema.statistics
       WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
      [idx.table, idx.name],
    );
    if (existing.length > 0) {
      console.log(`skip   ${idx.table}.${idx.name} (already exists)`);
      continue;
    }
    console.log(`run    ${idx.ddl}`);
    await conn.execute(idx.ddl);
  }
  console.log('\nMigration complete.');
} finally {
  await conn.end();
}
