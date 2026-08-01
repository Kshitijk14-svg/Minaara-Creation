# 13 — Database Indexing

A cross-cutting reference, not a build step: every index in the schema, pulled into one scannable table, plus the principles for adding new ones as the admin dashboard and query patterns grow. The authoritative definitions live in `02-database-schema.md` — this file exists so you can audit "what's indexed and why" without re-deriving it from the table-by-table prose.

## Full index reference

| Table | Index | Columns | Backs |
|---|---|---|---|
| `users` | `email_idx` | `email` | login lookup |
| `users` | `role_idx` | `role` | role-filtered admin queries |
| `users` | `user_role_created_idx` | `role, createdAt` | admin user-list sort |
| `otps` | `otp_email_expires_idx` | `email, expiresAt` | OTP verification lookup |
| `collections` | `coll_active_sort_idx` | `isActive, sortOrder` | storefront collection nav |
| `collections` | `coll_slug_idx` | `slug` | collection detail page |
| `products` | `prod_coll_idx` | `collectionId` | listing by collection |
| `products` | `prod_active_created_idx` | `isActive, createdAt` | default storefront listing |
| `products` | `prod_slug_idx` | `slug` | product detail page |
| `products` | `prod_featured_idx` | `isFeatured, isActive` | homepage featured rail |
| `products` | `prod_deleted_idx` | `deletedAt` | soft-delete filtering |
| `products` | `prod_bestseller_idx` | `isBestseller, isActive` | homepage bestseller rail |
| `products` | `prod_new_arrival_idx` | `isNewArrival, isActive` | homepage new-arrivals rail |
| `products` | `products_title_desc_ft` (manual) | `title, description` (FULLTEXT) | search — perf upgrade only, see `LIKE` fallback in file `04` |
| `product_size_variants` | `variant_product_size_unique` (unique) | `productId, size` | one row per size, also a correctness backstop |
| `product_size_variants` | `variant_product_idx` | `productId` | fetching all sizes for a product |
| `product_size_variants` | `variant_stock_idx` | `stock` | low-stock cron scan (`WHERE stock <= 3` across the whole table) |
| `stock_reservations` | `reservation_rzp_order_idx` | `razorpayOrderId` | committing/releasing a hold |
| `stock_reservations` | `reservation_variant_idx` | `variantId` | availability calc |
| `stock_reservations` | `reservation_expires_idx` | `expiresAt` | cleanup cron |
| `product_images` | `img_product_sort_idx` | `productId, sortOrder` | ordered image fetch |
| `orders` | `order_user_idx` | `userId` | customer order history |
| `orders` | `order_email_idx` | `customerEmail` | guest order lookup |
| `orders` | `order_status_created_idx` | `status, createdAt` | admin order list filter+sort |
| `orders` | `order_payment_idx` | `paymentStatus` | payment-status filter |
| `orders` | `order_created_idx` | `createdAt` | default admin sort |
| `orders` | `order_gateway_unique` (unique) | `paymentGatewayId` | idempotency backstop — see `14-race-conditions-concurrency.md` |
| `orders` | `order_delhivery_order_idx` | `delhiveryOrderId` | courier-side lookup |
| `orders` | `order_awb_idx` | `awbNumber` | tracking lookup |
| `order_items` | `item_order_idx` | `orderId` | fetching an order's line items |
| `order_items` | `item_product_idx` | `productId` | "who bought this product" queries |
| `coupons` | `coupon_code_idx` | `code` | checkout coupon lookup |
| `coupons` | `coupon_active_expiry_idx` | `isActive, expiryDate` | admin active-coupon list |
| `coupon_usages` | `coupon_usage_coupon_user_unique` (unique) | `couponId, userId` | enforces `perUserLimit = 1` at the DB level — see `14-race-conditions-concurrency.md` |
| `coupon_usages` | `coupon_usage_coupon_idx` | `couponId` | usage-count queries |
| `coupon_usages` | `coupon_usage_user_idx` | `userId` | a user's coupon history |
| `haveli_hotspots` | `haveli_hotspot_sort_idx` | `sortOrder` | ordered hotspot render |
| `blog_posts` | `blog_published_idx` | `isPublished, publishedAt` | public blog list |
| `blog_posts` | `blog_slug_idx` | `slug` | post detail page |
| `testimonials` | `testimonial_active_sort_idx` | `isActive, sortOrder` | homepage testimonials |

## Principles

- **Composite index column order**: equality-filter columns first, the sort/range column last. `(isActive, createdAt)` backs `WHERE isActive = ? ORDER BY createdAt` efficiently; the reverse order wouldn't. Every composite index above follows this rule — check new ones against it.
- **Unique indexes are often correctness backstops, not just lookups.** `order_gateway_unique`, `coupon_usage_coupon_user_unique`, and `variant_product_size_unique` all exist primarily to make a specific race condition impossible at the DB level, with the query-performance benefit being secondary. See `14-race-conditions-concurrency.md` for the full mapping — the two files describe the same indexes from two different angles.
- **The FULLTEXT index is a performance upgrade, never a correctness dependency** — it's a hand-written manual SQL migration outside `drizzle-kit push` (file `02`), and the search route must fall back to a `LIKE` scan if it's missing or errors. Don't ever make a query path *require* FULLTEXT to function.
- **New admin-dashboard filter/sort combinations need a matching composite index.** The pattern throughout the schema is one composite index per "filter by X, sort by Y" combination the UI actually offers (e.g. `order_status_created_idx` backs the admin order list's status filter + date sort). Adding a new filter or sort option to an admin list (file `06`) without a matching index will work fine on a small dev database and then silently become a full table scan once the catalog/order volume grows — don't assume a table stays small just because it starts small.
- **Run `EXPLAIN` before shipping a new query shape.** Before adding a new filter/sort combination to any admin list, run the query through `EXPLAIN` against a realistic data volume (seed a few thousand rows if needed) and confirm it uses the index you intended — not a filesort or a full table scan. This is cheap to check and expensive to discover in production after the catalog has grown.

## Verification

- `SHOW INDEX FROM <table>` for each table above matches this reference after `db:push` plus the manual FULLTEXT migration.
- Run `EXPLAIN` on the admin order list's default query (status filter + createdAt sort) and confirm it reports `order_status_created_idx` as the key used, not a filesort.
- Drop the FULLTEXT index temporarily and confirm search still returns correct (if slower) results via the `LIKE` fallback.
