// One-shot additive schema sync: adds the design_configs JSON columns and the
// blog_posts / newsletter_subscribers / testimonials tables that drizzle's
// schema.ts defines but the live DB is missing. Idempotent — safe to rerun.
// Usage: node scripts/migrate-schema-sync.mjs
// Bare `dotenv/config` only loads `.env`, not `.env.local` — but production
// (per OVH-deploy.md) keeps everything in .env.local. Load both, mirroring
// Next.js's own precedence (.env.local wins; dotenv's config() never
// overrides a var that's already set, so calling .env.local first is enough).
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();
import mysql from 'mysql2/promise';

const DESIGN_COLUMNS = [
  'heroContent',
  'uspItems',
  'marqueeWords',
  'aboutPanels',
  'editorialStories',
  'stats',
  'footerContent',
];

const CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS blog_posts (
    id            varchar(36)  NOT NULL PRIMARY KEY,
    title         varchar(255) NOT NULL,
    slug          varchar(255) NOT NULL UNIQUE,
    content       text         NOT NULL,
    excerpt       varchar(500),
    coverImageUrl varchar(1000),
    isPublished   boolean      NOT NULL DEFAULT false,
    publishedAt   datetime,
    authorId      varchar(36),
    createdAt     datetime     NOT NULL,
    updatedAt     datetime     NOT NULL,
    INDEX blog_published_idx (isPublished, publishedAt),
    INDEX blog_slug_idx (slug)
  )`,
  `CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id           varchar(36)  NOT NULL PRIMARY KEY,
    email        varchar(255) NOT NULL UNIQUE,
    isActive     boolean      NOT NULL DEFAULT true,
    subscribedAt datetime     NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS testimonials (
    id        varchar(36)  NOT NULL PRIMARY KEY,
    name      varchar(255) NOT NULL,
    city      varchar(100),
    text      text         NOT NULL,
    rating    int          NOT NULL DEFAULT 5,
    isActive  boolean      NOT NULL DEFAULT true,
    sortOrder int          NOT NULL DEFAULT 0,
    createdAt datetime     NOT NULL,
    updatedAt datetime     NOT NULL,
    INDEX testimonial_active_sort_idx (isActive, sortOrder)
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
