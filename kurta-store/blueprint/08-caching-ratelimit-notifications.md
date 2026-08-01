# 08 — Caching, Email & Cron Jobs

Build the cross-cutting infrastructure that every other subsystem leans on. The unifying principle: **Redis is an optional accelerator, never a hard dependency** — every integration point must degrade gracefully (cache miss, in-memory fallback) rather than fail when Upstash credentials are absent or Redis is unreachable. Rate limiting used to live in this file as section 3 — it's been split out to `10-rate-limiting.md` since it's substantial enough (and different enough in shape — request-gating, not data-caching) to warrant its own file. Read that file alongside this one; both build on the same `src/lib/redis.ts` client from section 1 below.

## 1. Redis client with a no-Redis stub (`src/lib/redis.ts`)

```ts
import { Redis } from '@upstash/redis';

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

export const redisConfigured = Boolean(url && token);

// Every command on this stub rejects immediately. Because every call site
// wraps Redis calls in try/catch and fails open, an unconfigured Redis behaves
// as an instant cache miss instead of a hang or an outage.
function createRedisStub(): Redis {
  const reject = () => Promise.reject(new Error('Redis not configured'));
  const pipeline = () => new Proxy({}, { get: (_t, prop) => (prop === 'exec' ? reject : () => pipeline()) });
  return new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'then') return undefined; // keep the stub non-thenable
      if (prop === 'pipeline' || prop === 'multi') return pipeline;
      return reject;
    },
  }) as unknown as Redis;
}

export const redis = redisConfigured
  ? new Redis({ url: url!, token: token!, retry: { retries: 1, backoff: () => 300 } })
  : createRedisStub();
```
Cap retries low (`retries: 1`) — since every caller fails open anyway, there's no value in the client's default ~10s exponential backoff; an unreachable Redis should cost well under a second per call.

## 2. Tag-based cache wrapper (`src/lib/cache.ts`)

Never use `KEYS`/`SCAN` for invalidation (O(N) over the whole keyspace, dangerous in production). Instead, store each cache entry under its own key with a TTL, and separately track a Redis **Set** per tag (`tag:{tag}` → member cache keys). Invalidating a tag = `SMEMBERS` the tag set, pipeline-`DEL` every member plus the tag set itself.

```ts
export async function cacheSet<T>(key: string, value: T, tags: string[], ttlSeconds: number): Promise<void> {
  try {
    const pipeline = redis.pipeline();
    pipeline.set(key, JSON.stringify(value), { ex: ttlSeconds });
    for (const tag of tags) {
      pipeline.sadd(`tag:${tag}`, key);
      pipeline.expire(`tag:${tag}`, ttlSeconds + 60);
    }
    await pipeline.exec();
  } catch { /* cache failures are non-fatal — silently swallow */ }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get<string>(key);
    if (raw == null) return null;
    return typeof raw === 'string' ? JSON.parse(raw) as T : raw as T;
  } catch { return null; }
}

export async function invalidateTags(tags: string[]): Promise<void> {
  try {
    const tagKeys = tags.map((t) => `tag:${t}`);
    const memberArrays = await Promise.all(tagKeys.map((k) => redis.smembers(k)));
    const allKeys = [...new Set(memberArrays.flat())];
    const pipeline = redis.pipeline();
    for (const key of allKeys) pipeline.del(key);
    for (const tagKey of tagKeys) pipeline.del(tagKey);
    await pipeline.exec();
  } catch { /* non-fatal */ }
}
```
Every function here is wrapped in try/catch that swallows the error — a cache operation must never turn into a request failure.

Centralize key/tag naming factories (`CacheKeys`, `CacheTags`) in this same file so a key pattern used at `cacheSet` time can never drift from the pattern used at invalidation time.

### Hand-rolled storefront caches

For the highest-traffic pages (homepage product rails, collection landing, homepage CMS config), cache directly by a fixed key **outside** the tag system for maximum resilience, and give mutation routes an explicit "purge these specific keys" helper (`invalidateStorefrontProducts()`, `invalidateStorefrontTestimonials()`, `invalidateStorefrontHaveliHotspots()`) so an edit shows up immediately rather than waiting out a TTL. Two invalidation systems sound redundant, but the hand-rolled one exists specifically so the site's most-viewed pages don't depend on the more general (and slightly more failure-prone, since it's an extra SMEMBERS round-trip) tag system.

## 3. Rate limiting — see `10-rate-limiting.md`

Rate limiting (the `MemoryRatelimit` fallback, `src/proxy.ts`'s per-route-class limiters, fail-open/fail-closed policy, and client-IP resolution) is built out fully in `10-rate-limiting.md`. It leans on the same `redis`/`redisConfigured` client from section 1 above, which is why it's covered here rather than in file `03` or `05` despite being consumed by both.

## 4. Email (`src/lib/email.ts`)

**Nodemailer only** — no SMS/WhatsApp API integration; if you want to mention WhatsApp as a support channel, do it as plain text in an email ("reply or WhatsApp us"), not as an actual send integration.

### Transport selection — SMTP, then Gmail, then console
```ts
function createTransporter() {
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) return { from: SMTP_FROM, transport: nodemailer.createTransport({host, port, secure, auth}) };
  if (EMAIL_USER && EMAIL_PASS) return { from: `"Your Brand" <${EMAIL_USER}>`, transport: nodemailer.createTransport({service: 'gmail', auth}) };
  return null;
}
```
> **Do not set `tls: { rejectUnauthorized: false }`.** The source project's transporter does, which disables TLS certificate verification and opens the connection to MITM interception — carry it over only if you first confirm it was compensating for a specific self-signed cert, and prefer fixing the cert/trust store instead. With a real SMTP provider or Gmail's own service transport, the default (verified) TLS should just work.

export async function sendEmail({ to, subject, html }) {
  const config = createTransporter();
  if (!config) { console.log(`[email dev] To: ${to} Subject: ${subject}`); return; } // dev fallback
  await config.transport.sendMail({ from: config.from, to, subject, html });
}
```

### Shared branded shell + escaping
Wrap every template in one `shell(content)` function producing consistent branded HTML (header/footer, address, support email). **Always `escapeHtml()` any user-controlled or external-source string** (order numbers, courier names, AWB numbers) before interpolating into raw HTML — order numbers are usually app-generated and safe, but courier names/tracking data come from a third-party API response and must be treated as untrusted.

### Templates to build
`renderOrderConfirmationEmail` (itemized summary, COD advance/balance breakdown if applicable, shipping address, CTA to the order page), `renderLowStockAlertEmail` (admin-facing), `renderOrderShippedEmail` / `renderOutForDeliveryEmail` / `renderOrderDeliveredEmail` / `renderDeliveryIssueEmail` (share a `trackingCta()` helper that runs any tracking URL through `isSafeHttpUrl()` before using it in an `href`), `renderAbandonCartEmail`.

## 5. Cron jobs — external crontab, not in-app scheduling

Every scheduled task is a plain `GET` route under `src/app/api/cron/*`, gated identically:
```ts
const expectedToken = `Bearer ${process.env.CRON_SECRET}`;
if (request.headers.get('Authorization') !== expectedToken) return NextResponse.json({error:'Unauthorized'}, {status:401});
```
These routes are **not scheduled by any code in the app** — they rely on the host's crontab hitting each URL with the bearer token (see file 09). Build:

- `abandon-cart` — emails customers whose synced cart (`/api/cart/sync`, file 05) has sat untouched for a threshold (e.g. 2 hours).
- `currency-refresh` — refreshes a cached currency-conversion-rate lookup, if you support multi-currency display.
- `delhivery-sync` (or your courier's equivalent) — polls for shipment status as the guaranteed-to-work fallback to the webhook (file 07).
- `release-stock-reservations` — `DELETE FROM stock_reservations WHERE expiresAt <= NOW()`. Purely a cleanup job — correctness never depends on it running promptly, since every availability read already filters `expiresAt > NOW()` itself (file 05).
- `stock-alert` — scans `product_size_variants` for `stock <= 3` on active, non-deleted products and emails the admin; a good place to also reconcile `coupons.usedCount` against actual `coupon_usages` row counts in the same pass, catching any drift from a bug or manual DB edit.

## Verification

- With Upstash env vars unset, exercise search, checkout, and OTP login — the app works identically, just without a shared cache/rate-limit state across processes.
- Manually call each `/api/cron/*` route without the bearer token — all return 401. With the correct token — all run and return a sane JSON summary.
- Send a test email with no SMTP/Gmail env vars configured — confirm it logs to console instead of throwing.
