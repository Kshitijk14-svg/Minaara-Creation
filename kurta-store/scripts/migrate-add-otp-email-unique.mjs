// One-shot additive schema sync: makes otps.email UNIQUE so send-otp's
// upsert (insert ... onDuplicateKeyUpdate) can atomically enforce a single
// active code per email, replacing the old non-transactional delete+insert
// that could leave duplicate rows under near-simultaneous requests. Mirrors
// scripts/migrate-add-indexes.mjs — idempotent, safe to rerun.
// Usage: node scripts/migrate-add-otp-email-unique.mjs
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

const conn = await mysql.createConnection(process.env.DATABASE_URL);
try {
  // Any duplicate emails already in the table (possible under the old race)
  // must be cleared before a UNIQUE index can be added — keep only the
  // newest row per email.
  const [dupes] = await conn.execute(`
    DELETE o1 FROM otps o1
    INNER JOIN otps o2
      ON o1.email = o2.email
      AND (o1.createdAt < o2.createdAt OR (o1.createdAt = o2.createdAt AND o1.id < o2.id))
  `);
  console.log(`removed ${dupes.affectedRows} stale duplicate otp row(s)`);

  const [existing] = await conn.execute(
    `SELECT DISTINCT INDEX_NAME AS name FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = 'otps' AND index_name = 'otp_email_unique'`,
  );
  if (existing.length > 0) {
    console.log('skip   otps.otp_email_unique (already exists)');
  } else {
    console.log('run    ALTER TABLE otps ADD UNIQUE INDEX otp_email_unique (email)');
    await conn.execute('ALTER TABLE otps ADD UNIQUE INDEX otp_email_unique (email)');
  }

  console.log('\nMigration complete.');
} finally {
  await conn.end();
}
