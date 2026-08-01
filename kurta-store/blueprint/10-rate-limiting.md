# 10 — Rate Limiting

Split out from `08-caching-ratelimit-notifications.md` because it's a genuinely different concern from caching/email/cron — it's request-gating for abuse resistance, not data-freshness plumbing — even though it shares the same underlying `redis`/`redisConfigured` client from file `08`'s section 1. Read that section first if you haven't wired up the Redis client yet.

## 1. In-memory fallback (`src/lib/rate-limit-fallback.ts`)

```ts
export interface LimitResult { success: boolean; limit: number; remaining: number; reset: number; }
export interface Limiter { limit(identifier: string): Promise<LimitResult>; }

export class MemoryRatelimit implements Limiter {
  private hits = new Map<string, number[]>();
  private lastPrune = Date.now();
  constructor(private max: number, private windowMs: number, private prefix: string) {}

  async limit(identifier: string): Promise<LimitResult> {
    const now = Date.now();
    this.pruneIfDue(now);
    const key = `${this.prefix}:${identifier}`;
    const cutoff = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return { success: false, limit: this.max, remaining: 0, reset: recent[0] + this.windowMs };
    }
    recent.push(now);
    this.hits.set(key, recent);
    return { success: true, limit: this.max, remaining: this.max - recent.length, reset: now + this.windowMs };
  }

  private pruneIfDue(now: number) {
    if (now - this.lastPrune < this.windowMs) return;
    this.lastPrune = now;
    const cutoff = now - this.windowMs;
    for (const [key, times] of this.hits) {
      if (times.length === 0 || times[times.length - 1] <= cutoff) this.hits.delete(key);
    }
  }
}
```
Matches `@upstash/ratelimit`'s `{success, limit, remaining, reset}` return shape exactly, so every call site can accept either implementation interchangeably. Self-prunes so the map can't grow unbounded; **per-process only** — fine for dev and a single instance, but not distributed across multiple app workers (see `12-scalability-performance.md` for exactly what that limitation costs you once file `09`'s PM2 cluster runs more than one worker). Document this limitation directly in the file.

## 2. `src/proxy.ts` — per-route-class limiters

```ts
function makeLimiter(max: number, windowSecs: number, prefix: string): Limiter {
  if (!redisConfigured) return new MemoryRatelimit(max, windowSecs * 1000, prefix);
  return new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(max, `${windowSecs} s`), prefix, analytics: false });
}

const orderLimiter    = makeLimiter(5, 60, 'rl:orders');
const otpLimiter      = makeLimiter(5, 600, 'rl:otp');
const passwordLimiter = makeLimiter(5, 600, 'rl:password');
const searchLimiter   = makeLimiter(30, 60, 'rl:search');
const generalLimiter  = makeLimiter(60, 60, 'rl:general');
```
Separate limiters per endpoint class so a burst against one route (e.g. search) can never starve capacity for another (e.g. checkout).

## 3. Fail-closed vs fail-open

This is the one place in the whole blueprint where "always degrade gracefully" is the wrong instinct:
- **Order creation, OTP send/verify, password login: fail closed** (503 if the limiter itself errors). These are fraud/brute-force/account-takeover surfaces — letting requests through unlimited during a Redis outage is worse than a temporary 503.
- **Search, general mutations: fail open.** Best-effort limiting; availability wins.

```ts
if (limiter) {
  try {
    const { success, limit, remaining, reset } = await limiter.limit(getIp(request));
    if (!success) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: {...} });
  } catch {
    if (failClosed) return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 });
    // best-effort limiter — allow through
  }
}
```

## 4. Client IP resolution

```ts
function getIp(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
    const hops = Math.max(1, parseInt(process.env.TRUSTED_PROXY_HOPS ?? '1', 10) || 1);
    // Count `hops` in from the RIGHT — those entries are added by trusted infra
    // (your reverse proxy); anything further left may be client-spoofed and
    // must never be trusted as the rate-limit key.
    const idx = Math.max(0, parts.length - hops);
    return parts[idx];
  }
  return request.headers.get('x-real-ip') ?? 'anonymous';
}
```
Set `TRUSTED_PROXY_HOPS` to exactly the number of reverse proxies sitting in front of the app (e.g. `1` for a single Nginx hop, per file `09`) — getting this wrong either lets attackers spoof their rate-limit identity or rate-limits your own proxy's IP for everyone behind it.

## 5. A second, targeted limiter where IP-based limiting isn't enough

Layer a **second, more targeted** limiter directly inside the OTP-send route itself (file `03`) — per-email, not per-IP, 3 requests / 10 minutes — on top of the IP-based `otpLimiter` in `proxy.ts`. Belt-and-suspenders for a brute-forceable endpoint where an attacker could rotate IPs but not emails. This is the general pattern to reach for any time an IP-based limit alone isn't the right identity to rate-limit on (email, coupon code, user id).

## 6. Defense in depth at the edge

`proxy.ts`'s limiters aren't the only layer — file `09`'s Nginx config adds a rate-limiting zone in front of the whole app as well. The app-level limiter is what makes the *policy* decisions (per-route-class limits, fail-open/closed, per-identity keys); the Nginx zone exists purely as a cheap first line of defense that drops obviously-abusive traffic before it even reaches a Node process.

## Verification

- With Upstash env vars unset, exercise search, checkout, and OTP login under load — the app enforces limits identically, just per-process rather than shared across workers.
- Trigger the OTP rate limit (4th request within 10 minutes for one email) — rejected with a clear message, independent of which IP it comes from.
- Trigger the IP-based `otpLimiter` from `proxy.ts` separately (many requests, rotating the email each time) — still rejected once the per-IP ceiling is hit.
- Simulate a Redis outage (bad Upstash credentials) while hitting an order-creation route — confirm it fails **closed** (503), not open.
- Simulate the same outage against the search route — confirm it fails **open** (request proceeds unlimited).
