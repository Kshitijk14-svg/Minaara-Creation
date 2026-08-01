# 02 — Database Schema

Build `src/db/schema.ts` as the single source of truth for every table, using Drizzle ORM's MySQL dialect. Build `src/db/index.ts` as the pooled connection singleton. Every later file (03–08) imports tables from this schema — get the enums and column names exactly right since they're referenced by name throughout.

## Conventions used throughout

- Every table's primary key is `varchar('id', { length: 36 })` defaulting to `randomUUID()` via `$defaultFn`, **except** `design_configs` (fixed string PK, see below) and `counters` (name-as-PK).
- `createdAt`/`updatedAt` are `datetime` columns defaulted via `$defaultFn(() => new Date())`, not MySQL's own `DEFAULT CURRENT_TIMESTAMP` — this keeps timestamp generation in JS/Drizzle, consistent across dialects if you ever migrate.
- Money columns are `double` and named with an explicit currency suffix (`priceINR`, `totalAmountINR`) rather than a generic `amount` — never store money as a bare unsuffixed number.
- mysql2 returns JSON columns as raw strings, and Drizzle's built-in `json()` type doesn't parse on read. Define a custom type once and reuse it for every JSON-blob column:

```ts
import { customType } from 'drizzle-orm/mysql-core';

const parsedJson = <TData>(name: string) =>
  customType<{ data: TData; driverData: string }>({
    dataType: () => 'json',
    toDriver: (value: TData) => JSON.stringify(value),
    fromDriver: (value: unknown): TData => {
      if (typeof value === 'string') {
        try { return JSON.parse(value) as TData; } catch { /* malformed legacy row */ }
      }
      return value as TData;
    },
  })(name);
```

## Tables

Build these in `src/db/schema.ts`, in this order (later tables reference earlier ones by FK):

### `users`
`id` (uuid pk), `email` (unique), `name`, `passwordHash` (nullable — OTP-only accounts have none until they set one), `role` (`mysqlEnum('role', ['SUPER_ADMIN','ADMIN','STAFF','CUSTOMER'])`, default `'CUSTOMER'`), `createdAt`, `updatedAt`.
Indexes: `email_idx(email)`, `role_idx(role)`, `user_role_created_idx(role, createdAt)` (backs the admin user-list sort).

### `otps`
`id`, `email` (unique — one pending code per email at a time), `code` (varchar 10), `expiresAt`, `createdAt`.
Index: `otp_email_expires_idx(email, expiresAt)`.

### `collections`
Flat (non-hierarchical) product categories. `id`, `name` (unique), `slug` (unique), `description`, `imageUrl`, `isActive` (default true), `sortOrder` (default 0), timestamps.
Indexes: `coll_active_sort_idx(isActive, sortOrder)`, `coll_slug_idx(slug)`.

### `products`
`id`, `title`, `slug` (unique), `description` (text, not null), `priceINR` (double), `compareAtPriceINR` (nullable, for showing a strikethrough MRP), `weightGrams` (nullable int — feeds shipping-rate weight calc), `collectionId` (FK → collections.id, not null), `isActive`/`isFeatured`/`isBestseller`/`isNewArrival` (booleans), `newArrivalUntil` (nullable datetime — lets "new arrival" badges auto-expire), `reelVideoUrl`/`reelVideoPosterUrl`/`reelVideoUpdatedAt` (a short vertical product video, nullable), `deletedAt` (nullable — **soft delete**, never hard-delete a product that might be referenced by historical orders), timestamps.
Indexes: `prod_coll_idx(collectionId)`, `prod_active_created_idx(isActive, createdAt)`, `prod_slug_idx(slug)`, `prod_featured_idx(isFeatured, isActive)`, `prod_deleted_idx(deletedAt)`, `prod_bestseller_idx(isBestseller, isActive)`, `prod_new_arrival_idx(isNewArrival, isActive)`.

### `product_size_variants`
The actual inventory model — one row per `(productId, size)`. There is deliberately **no color dimension**; add one later only if the new store actually needs it.
`id`, `productId` (FK), `size` (`mysqlEnum('size', ['XS','S','M','L','XL','XXL'])`), `stock` (int, default 0), timestamps.
Indexes: `uniqueIndex('variant_product_size_unique').on(productId, size)`, `variant_product_idx(productId)`, `variant_stock_idx(stock)` (backs a low-stock cron scanning `WHERE stock <= 3` across the whole table — don't skip this index).

### `stock_reservations`
Short-lived hold on stock, created the moment a payment-gateway order is minted, so a second concurrent buyer for the last unit is turned away **before** being charged (full mechanics in file 05). `id`, `razorpayOrderId` (varchar 64 — the gateway order id this hold belongs to), `variantId` (FK), `quantity`, `expiresAt`, `createdAt`.
Indexes: `reservation_rzp_order_idx(razorpayOrderId)`, `reservation_variant_idx(variantId)`, `reservation_expires_idx(expiresAt)`.
Availability reads always filter `WHERE expiresAt > NOW()`, so an uncollected expired row can never wrongly block a sale — a cleanup cron (file 08) deletes expired rows, but correctness never depends on that cron having run recently.

### `product_images`
`id`, `productId` (FK), `url` (varchar 1000), `altText` (nullable), `sortOrder` (default 0 — the image at `sortOrder = 0` is the "primary" thumbnail used everywhere: search results, order-item snapshots, cards).
Index: `img_product_sort_idx(productId, sortOrder)`.

### `orders`
`id`, `orderNumber` (unique, varchar 50 — format defined in file 05), `userId` (FK, **nullable** — guest checkout is allowed), `customerEmail`, `customerPhone`, `status` (`mysqlEnum` — `['PENDING','CONFIRMED','PROCESSING','SHIPPED','OUT_FOR_DELIVERY','DELIVERED','RTO_INITIATED','RTO_DELIVERED','CANCELLED','REFUNDED']`, default `'PENDING'`), `paymentStatus` (`mysqlEnum` — `['PENDING','PAID','FAILED','REFUNDED','COD_PENDING']`, default `'PENDING'`), `paymentGatewayId` (nullable, **unique** — this is the idempotency backstop, see file 05), `paymentMethod`, `subtotalINR`, `discountAmountINR` (default 0), `shippingINR` (default 0), `totalAmountINR`, `codAdvanceINR` (default 0 — the fixed online advance for COD orders; 0 for every non-COD order), `currency` (default `'INR'`), `notes` (text, nullable), `cancelledAt`/`deliveredAt` (nullable), plus courier-linkage columns: `delhiveryOrderId`, `delhiveryShipmentId`, `awbNumber`, `courierName`, `trackingUrl`, `delhiveryStatus`, `shippedAt`, `delhiveryPushError` (all nullable — populated after fulfillment, see file 07), timestamps.
Indexes: `order_user_idx(userId)`, `order_email_idx(customerEmail)`, `order_status_created_idx(status, createdAt)`, `order_payment_idx(paymentStatus)`, `order_created_idx(createdAt)`, `uniqueIndex('order_gateway_unique').on(paymentGatewayId)` (a gateway payment id backs at most one order — NULLs allowed for orders with no captured payment yet), `order_delhivery_order_idx(delhiveryOrderId)`, `order_awb_idx(awbNumber)`.

### `order_items`
Snapshot rows — never recomputed from live product data. `id`, `orderId` (FK), `productId`/`variantId` (FK, nullable so a later product deletion doesn't break historical order display), `title`, `size` (same enum as variants), `imageUrl`, `quantity`, `priceINR` — **the price and title at time of purchase**, deliberately duplicated off `products` so a later price change never rewrites order history.
Indexes: `item_order_idx(orderId)`, `item_product_idx(productId)`.

### `shipping_addresses`
One-to-one with an order. `id`, `orderId` (FK, **unique**), `fullName`, `line1`, `line2` (nullable), `city`, `state`, `pincode`, `country` (default `'India'`).

### `coupons`
`id`, `code` (unique), `discountType` (`mysqlEnum('discountType', ['PERCENT','FIXED'])`, default `'PERCENT'`), `discountValue`, `minOrderAmountINR` (default 0), `maxDiscountINR` (nullable — caps a percent discount), `maxUses` (nullable int — global cap), `perUserLimit` (default 1), `usedCount` (default 0), `expiryDate` (not null), `isActive`, timestamps.
Indexes: `coupon_code_idx(code)`, `coupon_active_expiry_idx(isActive, expiryDate)`.

### `coupon_usages`
`id`, `couponId` (FK), `userId` (FK), `orderId` (FK, **unique** — one usage row per order), `usedAt`.
`uniqueIndex('coupon_usage_coupon_user_unique').on(couponId, userId)` — this is what actually enforces the per-user coupon limit at the DB level when `perUserLimit = 1`; for `perUserLimit > 1` the app counts rows instead (file 05). Plus `coupon_usage_coupon_idx(couponId)`, `coupon_usage_user_idx(userId)`.

### `design_configs`
A deliberately single-row CMS table — the homepage's editable content. PK is a plain string (`id: varchar('id', { length: 50 }).primaryKey()`, not a UUID), seeded with exactly one row whose id is the literal string `'current_config'`. Every content field is a `parsedJson<T>()` column:
- `heroBanners: parsedJson<Array<{url, altText, linkHref}>>`
- `isLookbookActive: boolean` (default true)
- `activeTheme: varchar(50)` (default e.g. `'pastel-pink'` — an enum of a handful of named color themes)
- `promoBannerText: text` (nullable)
- `heroContent: parsedJson<{badgeText, headline, headlineEmphasis, subheading, imageUrl, ctaPrimaryLabel, ctaPrimaryHref, ctaSecondaryLabel, ctaSecondaryHref}>`
- `uspItems: parsedJson<Array<{icon, title, sub}>>`
- `marqueeWords: parsedJson<string[]>`
- `aboutPanels: parsedJson<Array<{num, label, heading, body, imageUrl}>>`
- `editorialStories: parsedJson<Array<{chapter, title, desc, imageUrl, href}>>`
- `stats: parsedJson<Array<{value, suffix, label}>>`
- `footerContent: parsedJson<{tagline, links: Array<{href, label}>}>`
- `haveliConfig: parsedJson<{imageUrl, heading, subheading, description}>` (the interactive lookbook banner's own copy — name it after whatever you call this feature in the new brand)
- `hiddenSections: parsedJson<string[]>` (homepage-section visibility toggle, see file 06)
- `updatedAt`

### `haveli_hotspots`
Clickable product pins overlaid on the lookbook banner image. `id`, `productId` (FK), `x`/`y` (double — percentage coordinates within the image, 0–100), `sortOrder` (default 0), timestamps.
Index: `haveli_hotspot_sort_idx(sortOrder)`.

### `blog_posts`
`id`, `title`, `slug` (unique), `content` (text), `excerpt` (nullable), `coverImageUrl` (nullable), `isPublished` (default false), `publishedAt` (nullable), `authorId` (FK → users, nullable), timestamps.
Indexes: `blog_published_idx(isPublished, publishedAt)`, `blog_slug_idx(slug)`.

### `newsletter_subscribers`
`id`, `email` (unique), `isActive` (default true), `subscribedAt`.

### `testimonials`
`id`, `name`, `city` (nullable), `text` (text), `rating` (int, default 5), `isActive` (default true), `sortOrder` (default 0), timestamps.
Index: `testimonial_active_sort_idx(isActive, sortOrder)`.

### `counters`
Named monotonic counters — currently backs only the order-number sequence (file 05), but keep it generic in case you need another named sequence later. `name` (varchar 50, **primary key**), `value` (int, default 0 — the *next* value to hand out, so it seeds at 0). Seed exactly one row: `{ name: 'order_number', value: 0 }`.

## Relations

Wire up Drizzle `relations()` for every FK above so joined queries can use the relational query API where convenient:
- `users` → many `orders`, many `couponUsages`
- `collections` → many `products`
- `products` → one `collection`, many `variants` (productSizeVariants), many `images` (productImages), many `orderItems`
- `productSizeVariants` → one `product`, many `orderItems`
- `productImages` → one `product`
- `orders` → one `user`, many `items` (orderItems), one `shippingAddress`, one `couponUsage`
- `orderItems` → one `order`, one `product`, one `variant`
- `shippingAddresses` → one `order`
- `coupons` → many `usages` (couponUsages)
- `couponUsages` → one `coupon`, one `user`, one `order`
- `blogPosts` → one `author` (user)

## The FULLTEXT index — a manual migration, not part of `schema.ts`

Drizzle's MySQL schema builder cannot express a `FULLTEXT` index. Product search (file 04) wants one on `products(title, description)`. Handle it as a hand-written SQL file outside the normal `db:push` flow:

```sql
-- drizzle/manual/0001_products_fulltext.sql
ALTER TABLE products ADD FULLTEXT INDEX products_title_desc_ft (title, description);
```

Apply it manually against the DB (`mysql < drizzle/manual/0001_products_fulltext.sql`) after the initial `db:push`. Requires the table to already be InnoDB (MySQL 8 default). Design the search route (file 04) to catch the "no such index" failure and fall back to a `LIKE` scan — **this migration must be a performance upgrade, never a correctness dependency**, since it's easy to forget on a fresh environment.

## `src/db/index.ts` — connection singleton

```ts
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema';

const globalForDb = globalThis as unknown as { pool?: mysql.Pool };

const pool = globalForDb.pool ?? mysql.createPool(process.env.DATABASE_URL!);
if (process.env.NODE_ENV !== 'production') globalForDb.pool = pool;

export const db = drizzle(pool, { schema, mode: 'default' });
```

The `globalThis` singleton guard prevents Next dev's hot-module-reload from spawning a fresh connection pool on every file save (which otherwise exhausts MySQL's max-connections limit within a few minutes of active development).

## Verification

- `npm run db:push` applies the schema with no errors against a real MySQL 8 instance.
- `npm run db:studio` opens Drizzle Studio and shows all 18 tables.
- Manually run the FULLTEXT `ALTER TABLE` and confirm `SHOW INDEX FROM products` lists `products_title_desc_ft`.
- Seed the `counters` table with the `order_number` row (a one-line `INSERT`) — file 05's order creation will hard-fail with `OrderError('COUNTER_MISSING', ...)` without it.
- Seed exactly one `design_configs` row with id `'current_config'` — file 06's homepage CMS GET route 404s without it.
