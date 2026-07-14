// One-shot seed: inserts the design_configs 'current_config' row if it's
// missing. Every other column is nullable (or has a schema default) and
// falls back to src/lib/design-defaults.ts on the public pages, so this
// only needs to satisfy heroBanners' NOT NULL constraint. Idempotent —
// safe to rerun.
// Usage: node scripts/migrate-seed-design-config.mjs
// Bare `dotenv/config` only loads `.env`, not `.env.local` — but production
// (per OVH-deploy.md) keeps everything in .env.local. Load both, mirroring
// Next.js's own precedence (.env.local wins; dotenv's config() never
// overrides a var that's already set, so calling .env.local first is enough).
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const [existing] = await conn.execute(
    `SELECT id FROM design_configs WHERE id = 'current_config'`,
  );

  if (existing.length > 0) {
    console.log("skip   design_configs row 'current_config' (already exists)");
  } else {
    await conn.execute(
      `INSERT INTO design_configs (id, heroBanners, isLookbookActive, activeTheme, updatedAt)
       VALUES ('current_config', ?, true, 'pastel-pink', NOW())`,
      ['[]'],
    );
    console.log("run    INSERT INTO design_configs ('current_config' row seeded)");
  }

  console.log('Seed complete.');
} finally {
  await conn.end();
}
