// One-shot additive schema sync: creates the `counters` table and seeds the
// `order_number` row that backs the sequential part of LBM-ddmmyy-N order
// numbers. Mirrors scripts/migrate-add-section-visibility.mjs — idempotent,
// safe to rerun.
//
// The seeded value is the NEXT number to hand out, so seeding 0 makes the first
// order LBM-<today>-0. Pass --start N to begin somewhere else (e.g. to continue
// a sequence already in use elsewhere); it is ignored if the row exists, so
// rerunning never rewinds a live counter.
//
// Usage: node scripts/migrate-add-order-counter.mjs [--start N]
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();
import mysql from 'mysql2/promise';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Checked .env.local and .env in the current directory (' + process.cwd() + ').');
  process.exit(1);
}

const startIdx = process.argv.indexOf('--start');
const start = startIdx !== -1 ? Number(process.argv[startIdx + 1]) : 0;
if (!Number.isInteger(start) || start < 0) {
  console.error(`--start must be a non-negative integer (got ${process.argv[startIdx + 1]}).`);
  process.exit(1);
}

const conn = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const createSql = `CREATE TABLE IF NOT EXISTS counters (
    name  varchar(50) NOT NULL,
    value int NOT NULL DEFAULT 0,
    PRIMARY KEY (name)
  )`;
  console.log('run    CREATE TABLE IF NOT EXISTS counters');
  await conn.execute(createSql);

  // INSERT IGNORE rather than a plain INSERT: rerunning must not reset a
  // counter that has already handed out numbers.
  const [res] = await conn.execute('INSERT IGNORE INTO counters (name, value) VALUES (?, ?)', ['order_number', start]);
  if (res.affectedRows === 1) console.log(`run    seeded counters.order_number = ${start}`);
  else console.log('skip   counters.order_number (already seeded)');

  const [[row]] = await conn.execute("SELECT value FROM counters WHERE name = 'order_number'");
  console.log(`\ncounters.order_number = ${row.value} (the next order will be LBM-<ddmmyy>-${row.value})`);
  console.log('Migration complete.');
} finally {
  await conn.end();
}
