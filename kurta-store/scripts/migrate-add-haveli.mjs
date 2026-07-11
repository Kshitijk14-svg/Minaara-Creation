// One-shot additive schema sync: adds the design_configs.haveliConfig JSON
// column and the haveli_hotspots table that drizzle's schema.ts defines but
// the live DB may be missing. Idempotent — safe to rerun.
// Usage: node scripts/migrate-add-haveli.mjs
import 'dotenv/config';
import mysql from 'mysql2/promise';

const DESIGN_COLUMNS = ['haveliConfig'];

const CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS haveli_hotspots (
    id        varchar(36)  NOT NULL PRIMARY KEY,
    productId varchar(36)  NOT NULL,
    x         double       NOT NULL,
    y         double       NOT NULL,
    sortOrder int          NOT NULL DEFAULT 0,
    createdAt datetime     NOT NULL,
    updatedAt datetime     NOT NULL,
    INDEX haveli_hotspot_sort_idx (sortOrder)
  )`,
];

const conn = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const [existing] = await conn.execute(
    `SELECT column_name AS name FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'design_configs'`,
  );
  const have = new Set(existing.map((r) => r.name));

  for (const col of DESIGN_COLUMNS) {
    if (have.has(col)) {
      console.log(`skip   design_configs.${col} (already exists)`);
      continue;
    }
    const sql = `ALTER TABLE design_configs ADD COLUMN ${col} json NULL`;
    console.log(`run    ${sql}`);
    await conn.execute(sql);
  }

  for (const sql of CREATE_TABLES) {
    const table = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)[1];
    console.log(`run    CREATE TABLE IF NOT EXISTS ${table} ...`);
    await conn.execute(sql);
  }

  const [cols] = await conn.execute('SHOW COLUMNS FROM design_configs');
  console.log(`\ndesign_configs now has ${cols.length} columns: ${cols.map((c) => c.Field).join(', ')}`);
  console.log('Migration complete.');
} finally {
  await conn.end();
}
