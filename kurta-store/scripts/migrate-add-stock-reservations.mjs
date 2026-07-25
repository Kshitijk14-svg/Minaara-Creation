// One-shot additive schema sync: creates the stock_reservations table that
// schema.ts defines but the live DB is missing (drizzle-kit push is
// interactive and blocked in this sandbox). Idempotent — safe to rerun.
// Usage: node scripts/migrate-add-stock-reservations.mjs
// Bare `dotenv/config` only loads `.env`, not `.env.local` — but production
// (per OVH-deploy.md) keeps everything in .env.local. Load both, mirroring
// Next.js's own precedence (.env.local wins; dotenv's config() never
// overrides a var that's already set, so calling .env.local first is enough).
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();
import mysql from 'mysql2/promise';

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS stock_reservations (
  id              varchar(36) NOT NULL PRIMARY KEY,
  razorpayOrderId varchar(64) NOT NULL,
  variantId       varchar(36) NOT NULL,
  quantity        int         NOT NULL,
  expiresAt       datetime    NOT NULL,
  createdAt       datetime    NOT NULL,
  INDEX reservation_rzp_order_idx (razorpayOrderId),
  INDEX reservation_variant_idx (variantId),
  INDEX reservation_expires_idx (expiresAt)
)`;

const conn = await mysql.createConnection(process.env.DATABASE_URL);
try {
  console.log('run    CREATE TABLE IF NOT EXISTS stock_reservations ...');
  await conn.execute(CREATE_TABLE);
  console.log('\nMigration complete.');
} finally {
  await conn.end();
}
