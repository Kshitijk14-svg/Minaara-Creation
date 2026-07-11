-- Manual migration: FULLTEXT index for product search (B1).
--
-- Drizzle's mysql-core schema builder cannot express FULLTEXT indexes, so this
-- must be applied by hand (or via your migration runner) in addition to
-- `npm run db:push` (which creates the regular indexes added to schema.ts:
-- user_role_created_idx, variant_stock_idx, order_gateway_unique).
--
-- Until this index exists, /api/search transparently falls back to a LIKE scan,
-- so applying it is a performance upgrade, not a correctness requirement.
--
-- Requires InnoDB (MySQL 5.6+) which supports FULLTEXT on InnoDB tables.

ALTER TABLE `products` ADD FULLTEXT INDEX `products_title_desc_ft` (`title`, `description`);

-- Optional: for short search terms to match, lower the FULLTEXT min token size.
-- This is a server variable and needs a restart + index rebuild:
--   SET GLOBAL innodb_ft_min_token_size = 2;  -- then rebuild the table/index
