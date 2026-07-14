// One-shot additive schema sync: adds the users.passwordHash column that
// drizzle's schema.ts defines but the live DB may be missing. Idempotent —
// safe to rerun.
// Usage: node scripts/migrate-add-password.mjs
import 'dotenv/config';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const [existing] = await conn.execute(
    `SELECT column_name AS name FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'users'`,
  );
  const have = new Set(existing.map((r) => r.name));

  if (have.has('passwordHash')) {
    console.log('skip   users.passwordHash (already exists)');
  } else {
    const sql = `ALTER TABLE users ADD COLUMN passwordHash VARCHAR(255) NULL`;
    console.log(`run    ${sql}`);
    await conn.execute(sql);
  }

  const [cols] = await conn.execute('SHOW COLUMNS FROM users');
  console.log(`\nusers now has ${cols.length} columns: ${cols.map((c) => c.Field).join(', ')}`);
  console.log('Migration complete.');
} finally {
  await conn.end();
}
