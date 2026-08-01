# 00 — Overview & How To Use This Blueprint

You are building a **new apparel e-commerce storefront** — a differently-branded clothing store that reuses the exact architecture, tech stack, and business logic of an existing production site ("Minara Creation" / kurta-store). This is not a generic "build me a shop" prompt: every pattern below was hardened through real production incidents (race conditions, payment double-charges, bundler bugs, silent Redis outages), so follow the specifics, not just the gist.

## The business

India-focused apparel e-commerce. Single currency of record: **INR** (all money columns are literally suffixed `INR`, e.g. `priceINR`, `totalAmountINR`; display-currency conversion for foreign visitors is a client-side overlay, never stored). Products are stocked per size (XS/S/M/L/XL/XXL), not per color. Checkout supports prepaid (Razorpay) and Cash-on-Delivery (small online advance + cash balance). Shipping/fulfillment is handled by Delhivery. The public site has a CMS-editable homepage (hero banners, USP strip, editorial stories, an interactive "lookbook" with clickable product hotspots) that a non-technical admin can update without a deploy.

## Tech stack (use exactly this — do not substitute)

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript, strict mode |
| Database | MySQL 8, via `mysql2` driver |
| ORM | Drizzle ORM (`drizzle-orm/mysql-core`), schema-first, `drizzle-kit push` (not migration-file generation) |
| Auth | NextAuth v5 (`next-auth` beta), JWT sessions, Credentials providers only (no OAuth) |
| Payments | Razorpay (`razorpay` SDK) |
| Shipping | Delhivery (static bearer-token REST API) |
| Cache / rate limiting | `@upstash/redis` + `@upstash/ratelimit`, with a hand-written in-memory fallback for both when Redis isn't configured |
| Media | Self-hosted on local/VPS disk — `sharp` (resize/webp) + `fluent-ffmpeg`/`ffmpeg-static`/`@ffprobe-installer/ffprobe` (video) — explicitly **not** Cloudinary/S3/any CDN service |
| Email | `nodemailer` (SMTP or Gmail), console-log fallback in dev |
| Styling | Tailwind CSS v4, CSS-native config (no `tailwind.config.*` file — `@theme` in `globals.css`) |
| Validation | `zod` on every API route |
| Animation | `framer-motion`, `gsap`, `lenis` (smooth scroll), `embla-carousel-react` |

## Folder layout convention

```
src/
  app/            Next.js App Router — pages + API route handlers, colocated *Client.tsx for interactivity
  components/
    providers/    React context providers (Cart, Currency, Wishlist, SmoothScroll)
    ui/           Reusable UI (Navbar, SearchBar, Carousel, modals, etc.)
  db/
    schema.ts     Single source of truth — every Drizzle table + relations
    index.ts      Pooled mysql2 connection, globalThis-singleton in dev
  lib/            Server-side business logic and integrations (auth, orders, delhivery, cache, redis, email, media...)
  types/          Shared TS types re-exported/derived from the schema
  proxy.ts        Next 16's middleware-equivalent — used ONLY for rate limiting (matcher: /api/:path*)
drizzle/           drizzle-kit output + hand-written manual SQL (e.g. FULLTEXT index)
scripts/           One-off migration/diagnostic/seed scripts (ts-node/mjs)
uploads/           Gitignored local media storage (prod uses MEDIA_DIR outside the checkout)
```

Convention: `page.tsx` is a server component that fetches data; it delegates all interactivity to a colocated `XxxClient.tsx` in the same folder. The admin dashboard is a **single route** (`/admin`) with client-side tab state — not one route per tab (except the `new`/`[id]/edit` forms, which are real routes).

## Build order — apply files 01 through 09 in sequence

Each numbered file below is a self-contained prompt for one subsystem. Later files assume earlier ones exist (e.g. file 05 assumes the schema from file 02 and the auth helpers from file 03).

| File | Subsystem |
|---|---|
| `01-setup-and-stack.md` | Project scaffolding, dependencies, config files, env vars |
| `02-database-schema.md` | Full Drizzle schema — every table, enum, index, relation |
| `03-auth.md` | NextAuth v5 (OTP + password credentials), roles, password hashing, route protection |
| `04-catalog.md` | Products/variants/collections/images, search, self-hosted media pipeline |
| `05-cart-checkout-payments.md` | Cart, stock reservations, order creation transaction, Razorpay, COD, coupons |
| `06-admin-cms.md` | Admin dashboard shell, role-gated CRUD, homepage CMS (`design_configs`), lookbook hotspots |
| `07-shipping-delhivery.md` | Delhivery rate/COD/push/webhook/tracking integration |
| `08-caching-ratelimit-notifications.md` | Redis wrapper + no-Redis fallback, email templates, cron jobs |
| `09-deployment.md` | Bare-VPS deployment shape (Nginx + PM2 + MySQL + crontab) |

Do not skip ahead — file 05's order-creation transaction locks rows defined in file 02, file 07's shipment push reads order fields also defined in file 02, etc.

## Cross-cutting references — files 10-14

These aren't sequential build steps — they're concerns that cut across everything above, each one a scattered detail in files 01-09 pulled into one auditable place. **Consult them throughout, not just after finishing file 09.** In particular, revisit them any time you add a new route that touches a limited resource, a new admin list filter, or a new third-party integration.

| File | Topic |
|---|---|
| `10-rate-limiting.md` | Split out of file 08 — per-route-class limiters, in-memory fallback, fail-open/fail-closed policy, IP resolution |
| `11-security.md` | Every security mechanism across files 01-10 in one checklist, plus known gaps/trade-offs (CSP, CSRF, dependency scanning, PII logging) |
| `12-scalability-performance.md` | Caching layers, stateless app tier, media serving, and the real ceiling of the in-memory fallbacks once PM2 runs more than one worker |
| `13-database-indexing.md` | Every index in the schema in one table, plus the composite-index-order and EXPLAIN-before-shipping principles |
| `14-race-conditions-concurrency.md` | Every concurrency race the blueprint handles, where, how, and how seriously to take each one — plus one undocumented race found by inspection (concurrent homepage-CMS edits) |
