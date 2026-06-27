# Backend Blueprint — Resilient Next.js + PostgreSQL + Redis E-Commerce Backend

A portable, production-grade backend architecture. This document captures **every
backend concept and the full stack** so you can reproduce the same backend in a new
project. Names are generic where possible; replace `app_` / `APP_` prefixes and the
example domain (e-commerce) with your own.

**Core philosophy: _degrade, never fail._** PostgreSQL is the source of truth and is
the only hard dependency. Redis (cache, rate limiting, OTP) is entirely optional —
every Redis path fails open and falls back to the database. Circuit breakers stop a
flapping dependency from taking down the request path. The whole thing is a single
server-rendered Next.js monolith designed to co-locate the app and Postgres on one
small VPS.

---

## 1. Overview & Philosophy

| Principle | How it shows up |
|---|---|
| **Source of truth = Postgres** | All durable state lives in Postgres via Drizzle. Redis only accelerates reads and holds ephemeral OTPs. |
| **Degrade, never fail** | `redisGet/Set/Del` swallow all errors → cache miss / write skipped. Rate limiter returns `null` (fail-open). OTP store falls back from Redis to a Postgres table. |
| **Bounded failure** | A `CircuitBreaker` wraps Redis so repeated failures stop hammering it for 30s. The DB pool sets `lock_timeout` / `statement_timeout` so no query or lock waits forever. |
| **Atomicity at the boundary** | Money/stock mutations run inside a single DB transaction with explicit `FOR UPDATE` row locks acquired in a deadlock-safe order. |
| **No user enumeration** | Auth endpoints return identical responses whether or not an account exists. Password verify runs even for missing users to keep timing uniform. |
| **Co-located & cheap** | One Next.js process (PM2 cluster, 1 worker/vCPU) + Postgres on the same host. Redis is the only external service. |

Stack: **Next.js 16 (App Router)**, **React 19**, **TypeScript 5**, **PostgreSQL 16**,
**Drizzle ORM** + `pg`, **Upstash Redis** (`@upstash/redis` + `@upstash/ratelimit`),
**jose** (JWT), Node `crypto` (scrypt), **Resend** + **Nodemailer** (email), **Tailwind 4**,
**Zustand** (client state — not backend, listed for completeness).

---

## 2. Tech Stack

| Dependency | Role | Why this choice |
|---|---|---|
| `next` (App Router) | Server + API route handlers + SSR | Single deployable unit; route handlers are plain `Request`→`Response`. |
| `drizzle-orm` + `drizzle-kit` | Typed SQL schema, queries, migrations | Type-safe, thin over SQL, SQL-first migrations you can read. |
| `pg` (`Pool`) | Postgres driver | Standard connection pool; works with PgBouncer or direct. |
| `@upstash/redis` | Cache + OTP store + rate-limit backend | HTTP-based (serverless-friendly), no persistent socket. |
| `@upstash/ratelimit` | Sliding-window rate limiting | Distributed, atomic, pairs with Upstash. |
| `jose` | Sign/verify JWT session tokens | Works in Edge + Node runtimes (needed for middleware). |
| `node:crypto` (`scrypt`) | Password hashing | Memory-hard KDF, no native deps, OWASP-grade params. |
| `resend` | Transactional HTML email (orders, alerts) | Simple API, good deliverability. |
| `nodemailer` | OTP email via Gmail SMTP | Cheap/free for low volume OTP sends. |
| Payment gateway (e.g. **Razorpay**) | Order creation + payment verification | Server creates order, verifies HMAC signature on callback. |

> Replace the email/payment vendors freely — the patterns (fire-and-forget email,
> server-side signature verification) are vendor-agnostic.

---

## 3. Directory Layout

```
src/
├── db/
│   ├── schema.ts            # Drizzle table + enum + relation definitions
│   ├── migrations/          # drizzle-kit generated SQL + journal
│   ├── migrate.ts           # programmatic migrator (db:migrate)
│   ├── seed.ts              # idempotent dev/prod seed (db:seed)
│   └── queries/             # one typed module per entity (products.ts, orders.ts, …)
├── lib/
│   ├── db.ts                # pg Pool + Drizzle instance + session timeouts
│   ├── redis.ts             # quota-aware get/set/del + rate limiter
│   ├── circuitBreaker.ts    # generic breaker + redisCircuit / dbCircuit
│   ├── cache.ts             # getCached() + CACHE_KEYS / CACHE_TTL
│   ├── otp.ts               # OTP store: Redis primary → Postgres fallback
│   ├── jwt.ts               # getJwtSecret() + verifySessionToken()
│   ├── password.ts          # scrypt hash/verify
│   ├── adminAuth.ts         # verifyAdminRequest(roles) guard for route handlers
│   └── email.ts             # Resend HTML templates (order/cart/low-stock)
├── models/
│   └── roles.ts             # Role union + role→redirect/label maps + assignments
├── middleware.ts            # Edge route guard for /admin and /auth
└── app/api/                 # route handlers (auth/*, checkout/*, admin/*, public reads)
```

**Layering rule:** route handlers → `db/queries/*` (or `lib/*`) → `lib/db` /
`lib/redis`. Route handlers never touch the `pg` Pool or Redis client directly.

---

## 4. Database Layer

### 4.1 Schema (`src/db/schema.ts`)

A 3NF relational schema. Key patterns to copy:

- **Enums** as Postgres enums:
  ```ts
  export const roleEnum = pgEnum("role", ["customer", "staff", "admin", "super_admin"]);
  export const orderStatusEnum = pgEnum("order_status",
    ["pending", "confirmed", "shipped", "delivered", "cancelled"]);
  export const discountTypeEnum = pgEnum("discount_type", ["percent", "fixed"]);
  ```

- **`serial` integer PKs** for most tables; **human-facing string PK** for orders
  (`varchar("id", { length: 20 })`, e.g. `ORD-AB12CD`) so IDs are shareable and not
  sequential-guessable.

- **Money is stored as integers** (`integer("price_inr")`) — the smallest currency
  unit. Never use floats for money. Format to a display string at the query/UI edge.

- **Composite-key join tables** for many-to-many (no surrogate id):
  ```ts
  export const productSizes = pgTable("product_sizes", {
    productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    size: varchar("size", { length: 10 }).notNull(),
  }, (t) => [primaryKey({ columns: [t.productId, t.size] })]);
  ```

- **FK `onDelete` strategy is deliberate:**
  - `cascade` — child has no meaning without parent (sizes, order items, join rows).
  - `restrict` — block deletion that would orphan history (can't delete a user/product that has orders).
  - `set null` — optional association (product → category, order → coupon).

- **Snapshot columns** — `order_items` copies `product_name` + `unit_price_inr` at
  purchase time, and `orders` snapshots the shipping address as JSON text. History
  must not change when the live product/price later changes.

- **Indexes** on every common filter/sort column (`is_published`, `category_id`,
  `status`, `created_at`, slugs) and **unique indexes** on natural keys (email, slug, code).

- **Key-value table** for editable settings (BCNF: `key` PK → `value`, `updated_at`):
  ```ts
  export const designSettings = pgTable("design_settings", {
    key: varchar("key", { length: 100 }).primaryKey(),
    value: text("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  });
  ```

- **Timestamps**: always `withTimezone: true`, `defaultNow()`. Separate
  `publishedAt` (nullable) from `createdAt` so drafts have a creation time but no
  publish time.

- **Drizzle `relations(...)`** declared for every FK so you can use the relational
  query API and keep joins type-safe.

Representative table:
```ts
export const orders = pgTable("orders", {
  id: varchar("id", { length: 20 }).primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  status: orderStatusEnum("status").notNull().default("pending"),
  totalInr: integer("total_inr").notNull(),
  couponId: integer("coupon_id").references(() => coupons.id, { onDelete: "set null" }),
  shippingName: varchar("shipping_name", { length: 200 }),
  shippingAddress: text("shipping_address"),               // JSON snapshot
  paymentOrderId: varchar("payment_order_id", { length: 100 }),
  paymentId: varchar("payment_id", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("orders_user_idx").on(t.userId),
  index("orders_status_idx").on(t.status),
  index("orders_created_at_idx").on(t.createdAt),
]);
```

Suggested table set for an e-commerce clone: `users`, `categories`, `products`,
`product_sizes`, `collections`, `collection_products`, `coupons`, `orders`,
`order_items`, `otp_codes`, `blog_posts`, `design_settings`, `abandoned_carts`.

### 4.2 Connection (`src/lib/db.ts`)

One `Pool` per process. Opt-in SSL via env (local Postgres has no TLS). Set
per-connection timeouts so a stuck lock or runaway query can never monopolize a
connection:

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
  max: Number(process.env.DB_POOL_MAX ?? 10),
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
});

pool.on("connect", (client) => {
  client.query(`
    SET deadlock_timeout  = '1s';   -- how soon Postgres checks for deadlocks
    SET lock_timeout      = '5s';   -- abort instead of queueing forever behind a lock
    SET statement_timeout = '30s';  -- kill runaway queries
  `).catch((err) => console.error("[db] Failed to set session timeouts:", err));
});

export const db = drizzle(pool, { schema });
export type DB = typeof db;
```

### 4.3 Migrations & seed

`drizzle.config.ts`:
```ts
import { defineConfig } from "drizzle-kit";
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
  verbose: true,
  strict: true,
});
```

`package.json` scripts:
```json
"db:generate": "drizzle-kit generate",
"db:migrate":  "tsx src/db/migrate.ts",
"db:seed":     "tsx src/db/seed.ts",
"db:studio":   "drizzle-kit studio"
```

- `migrate.ts` calls Drizzle's programmatic `migrate(db, { migrationsFolder })`.
- `seed.ts` uses `.onConflictDoNothing()` everywhere so it's **idempotent** (safe to
  re-run). Insert with `.returning()` to get generated ids, then build child rows
  (sizes, join rows) by mapping natural keys → returned ids.

---

## 5. Caching & Resilience

### 5.1 Read-through cache (`src/lib/cache.ts`)

```ts
import { redisGet, redisSet } from "./redis";

export async function getCached<T>(key: string, ttl: number, fallback: () => Promise<T>): Promise<T> {
  const cached = await redisGet<T>(key);
  if (cached !== null) return cached;
  const fresh = await fallback();
  redisSet(key, fresh, ttl).catch((e) => console.error("[cache] write failed:", e)); // fire-and-forget
  return fresh;
}
```

Centralize keys and TTLs so invalidation is never ad-hoc:
```ts
export const CACHE_KEYS = {
  PRODUCTS_ALL: "products:all",
  PRODUCT_BY_ID: (id: number) => `products:${id}`,
  SEARCH_RESULTS: (q: string) => `search:${q.toLowerCase().trim()}`,
  // …categories, collections, blog, settings
} as const;

export const CACHE_TTL = { PRODUCTS: 300, CATEGORIES: 600, SEARCH: 60, BLOG: 300, DESIGN: 3600 } as const;
```

**Invalidation is explicit on writes** — every create/update/delete calls `redisDel`
on the affected keys (see §7.1).

### 5.2 Quota-aware, fail-open Redis (`src/lib/redis.ts`)

Lazy singleton client. Every call is wrapped by the circuit breaker AND swallows
errors so Redis can never break a request:

```ts
export async function redisGet<T>(key: string): Promise<T | null> {
  try {
    return await redisCircuit.call(async () => {
      try { return await getRedis().get<T>(key); }
      catch (err) {
        if (isQuotaError(err)) return null; // free-tier "max daily request limit" → cache miss
        throw err;
      }
    });
  } catch {
    return null; // circuit open OR connection error → treat as miss, fall through to DB
  }
}
```
`redisSet` / `redisDel` follow the same shape but resolve to `void` (write/invalidation
simply skipped on failure). `isQuotaError` checks the message for `"max daily request limit"`.

### 5.3 Circuit breaker (`src/lib/circuitBreaker.ts`)

Generic CLOSED → OPEN → HALF_OPEN breaker. After `failureThreshold` failures it
opens for `timeoutMs`; then a single trial (`HALF_OPEN`) decides whether to close:

```ts
export class CircuitBreaker {
  private state: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";
  private failures = 0; private successes = 0; private reopenAt = 0;
  constructor(private readonly opts: { name: string; failureThreshold: number; successThreshold: number; timeoutMs: number }) {}

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (Date.now() < this.reopenAt) throw new CircuitOpenError(this.opts.name);
      this.state = "HALF_OPEN"; this.successes = 0;
    }
    try { const r = await fn(); this.recordSuccess(); return r; }
    catch (e) { this.recordFailure(); throw e; }
  }
  // recordSuccess: in HALF_OPEN, close after successThreshold; else reset failures.
  // recordFailure: open + set reopenAt once failures hit threshold.
}

export const redisCircuit = new CircuitBreaker({ name: "redis", failureThreshold: 5, successThreshold: 2, timeoutMs: 30_000 });
export const dbCircuit   = new CircuitBreaker({ name: "database", failureThreshold: 3, successThreshold: 2, timeoutMs: 15_000 });
```

---

## 6. Authentication & Authorization

### 6.1 Password hashing (`src/lib/password.ts`)

scrypt with OWASP-grade params, self-describing output, constant-time verify:

```ts
const PARAMS = { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 } as const; // N=2^15
// format: scrypt$N$r$p$<salt-b64>$<hash-b64>  — verification needs no external state

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password.normalize("NFKC"), salt, 64, PARAMS);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64"), derived.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored?: string | null): Promise<boolean> {
  if (!stored) return false;            // missing hash → false, but still cheap
  // parse params from the string, re-derive, timingSafeEqual; return false on any malformed input
}
```
- `passwordHash` column is **nullable** — accounts can exist before a password is set
  (OTP-first signup, legacy imports). `verifyPassword(pw, null)` returns false.
- Always `normalize("NFKC")` so visually identical Unicode passwords match.

### 6.2 OTP store with fallback (`src/lib/otp.ts`)

Redis primary (10-min TTL) → Postgres `otp_codes` table fallback so OTPs survive a
Redis outage and server restarts:

```ts
export async function setOtp(email, entry) {
  try { await redisSet(`otp:${email}`, { ...entry, attempts: 0 }, 600); return; }
  catch {/* fall through */}
  await db.insert(otpCodes).values({ ... }).onConflictDoUpdate({ target: otpCodes.email, set: { ... } });
}
export async function getOtp(email) {
  const cached = await redisGet<OtpEntry>(`otp:${email}`);
  if (cached !== null) return cached;
  // else SELECT from otp_codes
}
// incrementOtpAttempts uses an SQL expression (attempts = attempts + 1) — no read-modify-write race.
```

### 6.3 JWT sessions (`src/lib/jwt.ts` + auth routes)

`jose`, HS256, 7-day expiry, stored in an **httpOnly** cookie:

```ts
export function getJwtSecret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(s);
}
export async function verifySessionToken(token: string) {
  try { const { payload } = await jwtVerify(token, getJwtSecret());
    return { email: payload.email as string, role: payload.role as Role }; }
  catch { return null; }
}
```

Issuing the cookie (login & verify-otp):
```ts
const token = await new SignJWT({ email: user.email, role: user.role })
  .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d")
  .sign(getJwtSecret());
const jar = await cookies();
jar.set("app_session", token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 60 * 60 * 24 * 7,
  path: "/",
});
```

### 6.4 Roles (`src/models/roles.ts`)

```ts
export type Role = "customer" | "staff" | "admin" | "super_admin";
export const ROLE_ASSIGNMENTS: Record<string, Role> = {}; // seed super-admin from SUPER_ADMIN_EMAIL env
export const ROLE_REDIRECT: Record<Role, string> = { customer: "/", staff: "/admin", admin: "/admin", super_admin: "/admin" };
```
New users get `ROLE_ASSIGNMENTS[email] ?? "customer"` at creation.

### 6.5 Route-handler guard (`src/lib/adminAuth.ts`)

Reusable guard that returns either the session or a `Response` to short-circuit:

```ts
export async function verifyAdminRequest(request: NextRequest, allowedRoles: Role[])
  : Promise<{ email: string; role: Role } | Response> {
  const token = request.cookies.get("app_session")?.value;
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    const role = payload.role as Role;
    if (!allowedRoles.includes(role)) return Response.json({ error: "Forbidden" }, { status: 403 });
    return { email: payload.email as string, role };
  } catch { return Response.json({ error: "Unauthorized" }, { status: 401 }); }
}
```
Usage at the top of any protected handler:
```ts
const auth = await verifyAdminRequest(request, ["admin", "super_admin"]);
if (auth instanceof Response) return auth;   // not authorized
// …auth.email / auth.role available
```

### 6.6 Edge middleware (`src/middleware.ts`)

Coarse page-level protection (the fine-grained checks live in the API guard above).
**Next.js requires the file to be `src/middleware.ts` and to export `middleware` +
`config`** — `jose` is used precisely because it runs in the Edge runtime.

```ts
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/admin")) {
    const session = await getSessionPayload(request);          // verify JWT cookie
    if (!session) return NextResponse.redirect(new URL(`/auth?from=${pathname}`, request.url));
    if (!["staff", "admin", "super_admin"].includes(session.role)) return NextResponse.redirect(new URL("/", request.url));
  }
  if (pathname === "/auth") {                                  // bounce already-logged-in users away from login
    const session = await getSessionPayload(request);
    if (session) return NextResponse.redirect(new URL(ROLE_REDIRECT[session.role], request.url));
  }
  return NextResponse.next();
}
export const config = { matcher: ["/admin/:path*", "/auth"] };
```

### 6.7 Non-enumerating auth flows

- **Login** returns one generic `"Incorrect email or password."` for every failure
  (wrong password, no account, passwordless account), and runs `verifyPassword`
  even when the user is missing to keep response timing uniform.
- **Send-OTP** always returns `{ success: true }`: for a *signup* on an existing
  email it sends a "you already have an account" notice instead of an OTP; for a
  *reset* on a non-existent email it silently no-ops. The client cannot tell which
  emails exist.
- **Verify-OTP** enforces expiry + a max attempt count (e.g. 3), uses
  `timingSafeEqual` for the code compare, deletes the OTP on success, then upserts
  the password and issues the session.

---

## 7. Domain & Business Logic

### 7.1 Typed query modules (`src/db/queries/*`)

One module per entity. Reads go through `getCached`; writes invalidate keys:

```ts
export async function getPublishedProducts() {
  return getCached(CACHE_KEYS.PRODUCTS_PUBLISHED, CACHE_TTL.PRODUCTS, () =>
    db.select().from(products).where(eq(products.isPublished, true)));
}

export async function updateProduct(id: number, data: Partial<...>) {
  const [updated] = await db.update(products).set({ ...data, updatedAt: new Date() })
    .where(eq(products.id, id)).returning();
  if (updated) await redisDel(CACHE_KEYS.PRODUCTS_ALL, CACHE_KEYS.PRODUCTS_PUBLISHED, CACHE_KEYS.PRODUCT_BY_ID(id));
  return updated ?? null;
}
```

Search uses parameterized `ILIKE` and is cached briefly:
```ts
db.select({...}).from(products).where(and(
  eq(products.isPublished, true),
  sql`(${products.name} ILIKE ${pattern} OR ${products.subtitle} ILIKE ${pattern})`,
)).limit(6);
```

**Set-of-children writes are transactional + locked** (avoids interleaved DELETE+INSERT):
```ts
await db.transaction(async (tx) => {
  await tx.select({ id: products.id }).from(products).where(eq(products.id, productId)).for("update").limit(1);
  await tx.delete(productSizes).where(eq(productSizes.productId, productId));
  if (sizes.length) await tx.insert(productSizes).values(sizes.map((size) => ({ productId, size })));
});
```

### 7.2 Atomic order creation (`createOrder`)

The crown jewel. One transaction; locks taken in a **sorted, consistent order** to
prevent deadlocks; any throw rolls back everything:

```ts
export async function createOrder(input: CreateOrderInput) {
  return db.transaction(async (tx) => {
    let couponId: number | null = null;

    if (input.couponCode) {
      // FOR UPDATE prevents a TOCTOU double-spend race on usedCount
      const [c] = await tx.select().from(coupons)
        .where(eq(coupons.code, input.couponCode.toUpperCase())).for("update").limit(1);
      if (!c || !c.isActive) throw new Error("Invalid or inactive coupon");
      if (c.usageLimit !== null && c.usedCount >= c.usageLimit) throw new Error("Coupon usage limit reached");
      if (c.expiresAt && c.expiresAt < new Date()) throw new Error("Coupon has expired");
      couponId = c.id;
      await tx.update(coupons).set({ usedCount: sql`${coupons.usedCount} + 1` }).where(eq(coupons.id, c.id));
    }

    // Lock product rows in ASCENDING id order — consistent ordering = no deadlock
    const ids = [...new Set(input.items.map((i) => i.productId))].sort((a, b) => a - b);
    if (ids.length) await tx.select({ id: products.id }).from(products).where(sql`${products.id} = ANY(${ids})`).for("update");

    const [order] = await tx.insert(orders).values({ id: makeOrderId(), userId: input.userId, totalInr: input.totalInr, couponId, status: "pending", /* shipping snapshot, payment ids */ }).returning();
    await tx.insert(orderItems).values(input.items.map((i) => ({ orderId: order.id, productId: i.productId, productName: i.name, unitPriceInr: i.unitPriceInr, quantity: i.quantity, size: i.size ?? null })));
    for (const i of input.items) await tx.update(products).set({ stock: sql`${products.stock} - ${i.quantity}` }).where(eq(products.id, i.productId));

    return order;
  });
}
```
Order id is human-readable and non-sequential: `` `ORD-${Date.now().toString(36).toUpperCase().slice(-6)}` ``.

### 7.3 Payment flow (server-authoritative)

Two endpoints, gateway-agnostic pattern (example: Razorpay):

1. **`POST /api/checkout/create-order`** — auth-gated (any logged-in role). Validates
   the cart, snapshots an **abandoned-cart** row keyed by email, then calls the
   gateway's order API server-side (HTTP Basic auth with key id/secret) and returns
   the gateway order id + amount. Returns `503` if gateway keys are unset.

2. **`POST /api/checkout/verify-payment`** — **verify the HMAC signature before
   trusting anything:**
   ```ts
   const expected = createHmac("sha256", GATEWAY_KEY_SECRET)
     .update(`${gatewayOrderId}|${gatewayPaymentId}`).digest("hex");
   if (expected !== gatewaySignature) return Response.json({ error: "Payment signature verification failed." }, { status: 400 });
   ```
   Only then call `createOrder(...)` (atomic), delete the abandoned-cart row, and
   fire side effects.

> Production hardening note: re-look-up product prices from the DB inside
> `verify-payment` instead of trusting client-sent prices.

### 7.4 Side effects: email (`src/lib/email.ts`)

All transactional email is **fire-and-forget** — never block or fail the request on
email. Wrap each send in try/catch that only logs:
```ts
sendOrderConfirmation(email, order, items).catch((e) => console.error("[email]", e));
checkLowStock(items).catch((e) => console.error("[low-stock]", e));
```
Templates implemented: order confirmation, abandoned-cart reminder, low-stock admin
alert. OTP email goes via Nodemailer/Gmail SMTP; richer transactional mail via Resend
(`RESEND_FROM` must be a verified sender domain in production).

---

## 8. Rate Limiting

Upstash sliding-window limiter, with cached limiter instances and **fail-open**
semantics — if Redis is down/over quota the request is allowed:

```ts
const limiterCache = new Map<string, Ratelimit>();
function getLimiter(requests: number, window: RateLimitWindow) {
  const key = `${requests}:${window}`;
  if (!limiterCache.has(key)) limiterCache.set(key, new Ratelimit({ redis: getRedis(), limiter: Ratelimit.slidingWindow(requests, window), analytics: false }));
  return limiterCache.get(key)!;
}

export async function checkRateLimit(identifier: string, cfg: { requests: number; window: RateLimitWindow }) {
  try {
    return await redisCircuit.call(async () => {
      try { const { success, remaining, reset } = await getLimiter(cfg.requests, cfg.window).limit(identifier);
        return { limited: !success, remaining, reset }; }
      catch (err) { if (isQuotaError(err)) return null; throw err; }   // null = fail open
    });
  } catch { return null; }                                            // circuit open = fail open
}
```

Wire it at the top of public/abuse-prone handlers, keyed by client IP:
```ts
const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";
const rl = await checkRateLimit(`search:${ip}`, { requests: 20, window: "1 m" });
if (rl?.limited) return Response.json({ error: "Too many requests." }, { status: 429 });
```

Recommended limits: search **20/min**, public product reads **60/min**, send-OTP
**5 / 10 min**, verify-OTP **10 / 5 min**, login **10 / 5 min**.

---

## 9. API Conventions

- **App Router route handlers** in `src/app/api/**/route.ts`, exporting `GET`/`POST`/
  `PATCH`/`DELETE`. Dynamic segments via `[id]` folders.
- Respond with `Response.json(body, { status })`. Status codes used: `200/201`,
  `400` (bad input), `401` (unauthenticated), `403` (forbidden), `429` (rate
  limited / too many OTP attempts), `502/503` (upstream gateway), `500` (unexpected).
- **Validate input explicitly** at the top of each handler; reject early.
- **Generic error messages** to clients (`"Login failed. Please try again."`); log
  the real error server-side with a `[handler-name]` prefix.
- Protected handlers start with `verifyAdminRequest(request, roles)`; checkout
  handlers allow all logged-in roles (`["customer","staff","admin","super_admin"]`).

---

## 10. Environment & Deployment

### 10.1 Environment variables (`.env.example`)
```bash
# Auth
JWT_SECRET=                       # long random string — REQUIRED
SUPER_ADMIN_EMAIL=you@example.com # gets super_admin role on first sign-in

# Database (self-hosted Postgres)
DATABASE_URL=postgres://app:CHANGEME@localhost:5432/app
DATABASE_SSL=false                # "true" only for remote DBs that require TLS
DB_POOL_MAX=10

# Redis (Upstash — optional; app fails open if absent)
UPSTASH_REDIS_REST_URL=https://xxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxxx

# Email
RESEND_API_KEY=
RESEND_FROM="App <noreply@yourdomain.com>"
GMAIL_USER=                       # OTP sender (SMTP)
GMAIL_PASS=                       # Gmail app password
ADMIN_EMAIL=                      # low-stock alerts

# Payments
PAYMENT_KEY_ID=
PAYMENT_KEY_SECRET=

# Misc
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
```

### 10.2 Local dev — Docker Postgres (`docker-compose.yml`)
```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment: { POSTGRES_USER: app, POSTGRES_PASSWORD: CHANGEME, POSTGRES_DB: app }
    ports: ["5432:5432"]
    volumes: [app_pgdata:/var/lib/postgresql/data]
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U app -d app"], interval: 10s, timeout: 5s, retries: 5 }
volumes: { app_pgdata: }
```
Dev loop: `cp .env.example .env.local` → `docker compose up -d` →
`npm run db:generate && npm run db:migrate && npm run db:seed` → `npm run dev`.

### 10.3 Production — single VPS (`ecosystem.config.js`)
PM2 cluster, one worker per vCPU, behind an Nginx reverse proxy; Postgres on
localhost (no SSL); Redis external (Upstash):
```js
module.exports = { apps: [{
  name: "app", script: "node_modules/next/dist/bin/next", args: "start",
  instances: 2, exec_mode: "cluster", max_memory_restart: "700M",
  env: { NODE_ENV: "production", PORT: 3000 },
}]};
```
Prod deploy: build (`next build`), `pm2 start ecosystem.config.js`, `pm2 save && pm2
startup`. Add Nginx TLS (Certbot) and a nightly `pg_dump` cron. On a 4 GB box, keep
Postgres `shared_buffers` ~1 GB and add swap.

---

## 11. Reproduction Checklist

1. **Scaffold** a Next.js (App Router) + TypeScript project.
2. **Install:** `drizzle-orm pg @upstash/redis @upstash/ratelimit jose resend nodemailer`
   and dev deps `drizzle-kit tsx @types/pg @types/nodemailer`.
3. **DB schema** — author `src/db/schema.ts` (enums, tables, FK strategy, indexes,
   relations). Add `drizzle.config.ts` + `db:generate/migrate/seed/studio` scripts.
4. **Connection** — `src/lib/db.ts` (pooled `pg` + session timeouts).
5. **Resilience** — `src/lib/circuitBreaker.ts`, then `src/lib/redis.ts` (quota-aware
   fail-open wrappers + rate limiter), then `src/lib/cache.ts` (`getCached` + keys/TTLs).
6. **Auth** — `src/lib/password.ts` (scrypt), `src/lib/jwt.ts`, `src/models/roles.ts`,
   `src/lib/otp.ts` (Redis→Postgres fallback), `src/lib/adminAuth.ts`,
   `src/middleware.ts`.
7. **Queries** — one `src/db/queries/<entity>.ts` per table; reads via `getCached`,
   writes via `redisDel`; transactional/locked mutations for money & stock.
8. **Routes** — `src/app/api/auth/*` (send-otp, verify-otp, login, me, signout),
   `src/app/api/checkout/*` (create-order, verify-payment w/ HMAC), `src/app/api/admin/*`
   (guarded CRUD), public cached reads. Add `checkRateLimit` to abuse-prone routes.
9. **Email** — `src/lib/email.ts`, all sends fire-and-forget.
10. **Env** — write `.env.example`; set `JWT_SECRET`, `DATABASE_URL`, Upstash, email,
    payment vars.
11. **Run** — `docker compose up -d` → `db:generate` → `db:migrate` → `db:seed` →
    `dev`. For prod: `next build` + PM2 cluster + Nginx/TLS + nightly `pg_dump`.

---

### Invariants to preserve when adapting
- Postgres is the only hard dependency; **every Redis path must fail open**.
- **Money = integers**; **history = snapshots** (never recompute from live rows).
- **Money/stock mutations = one transaction + sorted `FOR UPDATE` locks.**
- **Auth never reveals which emails exist**; secrets compared with `timingSafeEqual`.
- **Sessions = httpOnly JWT cookie**; `JWT_SECRET` required at boot.
- **Payments verified by server-side HMAC** before any DB write.
