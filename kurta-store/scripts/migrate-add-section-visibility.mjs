// One-shot additive schema sync: adds the design_configs.hiddenSections JSON
// column, storing the array of homepage section keys an admin has hidden via
// the Design tab. Mirrors scripts/migrate-add-haveli.mjs — idempotent, safe
// to rerun.
// Usage: node scripts/migrate-add-section-visibility.mjs
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();
import mysql from 'mysql2/promise';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Checked .env.local and .env in the current directory (' + process.cwd() + ').');
  process.exit(1);
}

const DESIGN_COLUMNS = ['hiddenSections'];

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

  const [cols] = await conn.execute('SHOW COLUMNS FROM design_configs');
  console.log(`\ndesign_configs now has ${cols.length} columns: ${cols.map((c) => c.Field).join(', ')}`);
  console.log('Migration complete.');
} finally {
  await conn.end();
}
