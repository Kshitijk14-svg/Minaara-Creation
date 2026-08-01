# 12 — Scalability & Performance

A cross-cutting reference, not a build step: how this architecture actually scales, where the real headroom is, and where the "graceful degradation without Redis" story quietly runs out. Each point names where the real implementation lives.

## Stateless app tier

- **PM2 cluster mode**, 2+ workers, zero-downtime `pm2 reload` (restarts one worker at a time, always at least one serving traffic). File `09`.
- **JWT sessions, not database sessions** — a session lives entirely in the client's cookie, so any worker (or, later, any server) can handle any request with no session-affinity requirement. File `03`.
- **Cron kept out-of-process** — scheduled work is a plain `GET /api/cron/*` route hit by the host's crontab, not an in-app scheduler. This keeps every app process interchangeable and restart-safe; nothing breaks if a worker restarts mid-cron-window. Files `08`/`09`.

## Database

- **Pooled connection + `globalThis` singleton** — `mysql.createPool` reused across Next dev's hot-module-reload so file edits during development don't spawn a fresh pool each save and exhaust MySQL's `max_connections`. File `02`.
- **`FOR UPDATE` locks are scoped as narrowly as possible** (specific variant/coupon/counter rows, never a table lock) — see `14-race-conditions-concurrency.md` for the full list; this matters for scalability because a wide lock would serialize unrelated checkouts against each other.
- **`innodb_buffer_pool_size` tuned to ~25% of VPS RAM**, `max_connections` sized to `(PM2 workers) × (pool connectionLimit)` with headroom. File `09`.

## Caching

- **Tag-based Redis cache** for general-purpose invalidation, plus **hand-rolled fixed-key storefront caches** for the highest-traffic pages (homepage rails, collection landing, homepage CMS) that get an explicit "purge these exact keys" helper instead of going through the tag system — fewer round-trips, more resilient. File `08`.
- **Next's own page cache** (`revalidatePath`) is a second, independent caching layer from Redis — every CMS/product mutation route invalidates both, since they don't know about each other. Files `06`/`04`.
- **Cursor-based (not offset) pagination** on the public product listing — stays performant as the catalog grows, unlike `OFFSET n` which gets slower the deeper you paginate. File `04`.
- **FULLTEXT search with a `LIKE` fallback** — the FULLTEXT index is purely a performance upgrade; search must produce correct (if slower) results even on a database where the manual migration was never applied. Files `02`/`04`.

## Media

- **CDN-less by design** — Nginx serves `/media/*` originals directly via `alias`, bypassing the Next.js process entirely for the common case; the on-demand-resize route only handles first-request resizing, after which the resized variant is disk-cached and served the same way. Files `04`/`09`.
- **Concurrent-first-request de-dup** — an in-memory `Map<string, Promise<Buffer>>` keyed by the target cache path prevents N simultaneous requests for a never-before-resized width from each independently resizing and racing to write the same file. File `04`. (See the caveat below — this de-dup is per-process.)

## Non-blocking side effects

- **Email sends and courier pushes fire without being awaited into the response** (`.catch()`-logged, never blocking) — a slow or failing third-party call must never add latency to, or fail, the customer-facing checkout response. Files `05`/`07`.

## Bundle size

- **`dynamic()` imports for every admin tab except the default-landing Overview tab**, plus `optimizePackageImports` for `framer-motion`/`gsap` — keeps the admin bundle from loading every tab's code on first paint. Files `06`/`01`.

## The actual ceiling of "no Redis configured"

This is worth stating plainly since it doesn't show up anywhere else: **PM2 cluster mode runs 2+ separate Node processes on one box**, not one process with multiple threads. Two things in this blueprint fall back to **per-process, in-memory state** when Redis isn't configured:

1. `MemoryRatelimit` (file `10`) — each worker tracks its own hit counts, so a 2-worker cluster enforces every limit at roughly half its stated strength (an attacker's requests get load-balanced across workers, each of which thinks it's seen half as many).
2. The image-resize de-dup `Map` (file `04`) — each worker has its own map, so a cold-cache resize race across two different workers isn't actually de-duplicated, only a race *within* one worker is.

Both of these are consistent with the blueprint's stated philosophy ("never hard-fail without Redis") — a slightly-loose rate limit or an occasional duplicate resize is a much better failure mode than an outage. But don't read "graceful degradation" as "no difference": **Redis is what makes both of these exact once you're running more than one worker**, and you already are, per file `09`'s 2-worker PM2 setup. If you ever need to scale beyond a single VPS to multiple app servers, this stops being a nuance and becomes a requirement — Redis (or an equivalent shared store) is no longer optional at that point for either rate limiting or cache/dedup correctness.

## Verification

- Load-test the search route with Redis both configured and unset — confirm response times stay reasonable in both cases (cache miss vs cache hit).
- With 2 PM2 workers and Redis unset, hit the OTP-send route enough times from one IP across both workers — confirm the *effective* limit is looser than the configured single-process limit (demonstrating the ceiling above), then repeat with Redis configured and confirm it's exact.
- Kill one PM2 worker mid-load — site stays up, proving the cluster (not a single process) serves traffic. File `09`.
- Paginate deep into a large product catalog — confirm response time doesn't degrade the way an `OFFSET`-based query would.
