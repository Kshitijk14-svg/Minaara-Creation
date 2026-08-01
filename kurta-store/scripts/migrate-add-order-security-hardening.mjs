// One-shot additive schema sync for the 2026-08 security hardening pass:
//   1. coupon_usages: the unique index on (couponId, userId) permanently capped
//      every coupon at 1 use/user regardless of perUserLimit — replace with a
//      plain index. Enforcement already lives in createOrder's FOR UPDATE-locked
//      count check (src/lib/orders.ts), so this is safe to swap live.
//   2. stock_reservations: add releaseToken, so /api/payment/release-reservation
//      can require proof the caller started this checkout, not just knowledge
//      of a razorpayOrderId.
//   3. failed_refunds: new table — durable record of a captured payment whose
//      auto-refund itself failed (see the REFUND_FAILED path in
//      src/app/api/payment/verify/route.ts), surfaced in the admin Overview tab.
// Idempotent — safe to rerun (checks first, skips anything already applied).
// Usage: node scripts/migrate-add-order-security-hardening.mjs
//
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

async function tableExists(conn, table) {
  const [rows] = await conn.execute(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`,
    [table],
  );
  return rows.length > 0;
}

async function indexNames(conn, table, columns) {
  // Returns every distinct index name covering exactly this column set,
  // regardless of what it happens to be called (auto-generated vs explicit).
  const [rows] = await conn.execute(
    `SELECT INDEX_NAME AS name, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
     FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ?
     GROUP BY INDEX_NAME`,
    [table],
  );
  const wanted = columns.join(',');
  return rows.filter((r) => r.cols === wanted).map((r) => r.name);
}

async function fixCouponUsagesIndex(conn) {
  const table = 'coupon_usages';
  if (!(await tableExists(conn, table))) {
    console.log(`skip   ${table} (table does not exist — run the base schema migration first)`);
    return;
  }

  const matching = await indexNames(conn, table, ['couponId', 'userId']);
  const hasCorrectPlainIndex = matching.includes('coupon_usage_coupon_user_idx');

  for (const name of matching) {
    if (name === 'coupon_usage_coupon_user_idx') continue;
    // Any other index over exactly (couponId, userId) is the old unique
    // constraint (auto-named or explicit) that breaks perUserLimit > 1.
    const sql = `ALTER TABLE ${table} DROP INDEX \`${name}\``;
    console.log(`run    ${sql}`);
    await conn.execute(sql);
  }

  if (hasCorrectPlainIndex) {
    console.log(`skip   ${table}.coupon_usage_coupon_user_idx (already exists)`);
  } else {
    const sql = `ALTER TABLE ${table} ADD INDEX coupon_usage_coupon_user_idx (couponId, userId)`;
    console.log(`run    ${sql}`);
    await conn.execute(sql);
  }
}

async function addReleaseTokenColumn(conn) {
  const table = 'stock_reservations';
  if (!(await tableExists(conn, table))) {
    console.log(`skip   ${table} (table does not exist — run the base schema migration first)`);
    return;
  }

  const [existing] = await conn.execute(
    `SELECT column_name AS name FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = 'releaseToken'`,
    [table],
  );
  if (existing.length > 0) {
    console.log(`skip   ${table}.releaseToken (already exists)`);
    return;
  }
  const sql = `ALTER TABLE ${table} ADD COLUMN releaseToken varchar(36)`;
  console.log(`run    ${sql}`);
  await conn.execute(sql);
}

async function createFailedRefundsTable(conn) {
  const table = 'failed_refunds';
  if (await tableExists(conn, table)) {
    console.log(`skip   ${table} (already exists)`);
    return;
  }
  const sql = `
    CREATE TABLE ${table} (
      id varchar(36) NOT NULL,
      paymentId varchar(64) NOT NULL,
      orderErrorCode varchar(50) NOT NULL,
      amountPaise int NOT NULL,
      createdAt datetime NOT NULL,
      resolvedAt datetime DEFAULT NULL,
      PRIMARY KEY (id),
      KEY failed_refund_resolved_idx (resolvedAt)
    )
  `.trim();
  console.log(`run    CREATE TABLE ${table} (...)`);
  await conn.execute(sql);
}

const conn = await mysql.createConnection(process.env.DATABASE_URL);
try {
  await fixCouponUsagesIndex(conn);
  await addReleaseTokenColumn(conn);
  await createFailedRefundsTable(conn);
  console.log('\nMigration complete.');
} finally {
  await conn.end();
}
