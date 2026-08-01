# 11 — Security

A cross-cutting reference, not a build step: every item below is already implemented somewhere in files `01-10`, scattered wherever it happened to come up first. This file exists so you can audit "what's our security posture" as one topic instead of hunting through nine subsystem files. Each point names where the real implementation lives — go there for the actual code.

## Transport & headers

- **Security headers** — HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`, and a partial CSP, all set via `next.config.ts`'s `headers()`. File `01`.
- **TLS everywhere** — Let's Encrypt cert at the Nginx layer (file `09`); never disable certificate verification on an outbound connection (`tls: { rejectUnauthorized: false }`) without first confirming it's compensating for a specific self-signed cert you can't otherwise fix — the email transporter explicitly calls this out. File `08`.

## Authentication & session

- **Password hashing** — Node's built-in `scrypt`, self-describing stored format (`scrypt$N$r$p$salt$hash`) so parameters can change later without invalidating old hashes. File `03`.
- **Timing-attack resistance** — `verifyPassword` always runs a full scrypt computation even for a nonexistent user (never fast-returns on "no such account"); OTP code comparison uses `crypto.timingSafeEqual` (length-checked first, since it throws on mismatched lengths). File `03`.
- **OTP brute-force lockout** — Redis-backed fail counter, locks an email after 5 failed attempts in 15 minutes, distinguishable error code (`otp_locked`) so the frontend can show a different message than "wrong code". Swallows Redis errors rather than blocking login outright if the lockout check itself fails. File `03`.
- **Bearer-token-or-session dual auth** (`isAuthorized`, `isInternalRequest`, `safeEqual`) — lets cron/server-to-server callers hit admin-gated routes via a constant-time-compared static secret, while browser traffic authenticates via the session cookie. File `03`.
- **No middleware-based auth** — every protected page/route checks `auth()`/`isAuthorized()` itself; `src/proxy.ts` is reserved purely for rate limiting (file `10`) so auth logic never silently drifts out of sync with routes added later. File `03`.
- **Role gating within admin** — `STAFF` is read-only on sensitive tabs (e.g. Products), checked both client-side (`canWrite`) and at the route level (`isAuthorized(request, level)`); role management itself requires the stricter `'admin'` level. File `06`.

## Input handling & injection

- **`zod` validation on every API route** — no route trusts a client-shaped body without a schema.
- **Parameterized queries only** — Drizzle parameterizes by default; never string-concatenate user input into a raw `sql.raw(...)` call. The one place raw `sql` is used for a lock (`SELECT ... FOR UPDATE`, file `05`) uses tagged-template interpolation, never string concatenation.
- **File upload validation** — magic-byte sniffing of the actual file content (JPEG/PNG/GIF/WEBP signatures), never trusting the client-reported MIME type. File `04`.
- **Path-traversal containment** — the media-serving route validates filenames against a strict `^[a-zA-Z0-9_-]+\.webp$` pattern plus a `path.relative`-based containment check, on the reasoning that a legitimately-uploaded file is *always* named `<uuid>.webp` so there's never a reason to try to sanitize anything fancier. File `04`.

## Third-party integration boundaries

- **Payment verification** — HMAC-SHA256 signature recompute compared via `timingSafeEqual`; the *actual* trust boundary is re-fetching the order from Razorpay's own API (`razorpay.orders.fetch`) rather than trusting the client's callback payload; an amount-binding guard rejects any recomputed total that doesn't exactly match what the gateway actually captured. File `05`.
- **Webhook authentication** — constant-time shared-secret header compare (configurable header name); always returns HTTP 200 past the auth check even on a processing error, so the courier doesn't retry-storm a webhook it considers delivered. File `07`.
- **Untrusted-URL sanitization** — any courier-sourced tracking URL is checked via `isSafeHttpUrl()` (must parse as `http:`/`https:`) before it can reach an `<a href>` anywhere — admin UI, customer profile, or email — closing off `javascript:`/`data:` URI injection via a compromised or malformed webhook payload. File `07`/`08`.
- **Email HTML escaping** — `escapeHtml()` wraps every user-controlled or third-party-sourced string (order numbers, courier names, AWB numbers) before interpolating into raw template HTML. File `08`.

## Secrets & infrastructure

- **Independent random secrets, one per purpose, never reused**: `AUTH_SECRET` (NextAuth), `ADMIN_SECRET_KEY` (admin bearer auth), `INTERNAL_API_KEY` (server-to-server-only routes), `CRON_SECRET` (cron bearer auth), `DELHIVERY_WEBHOOK_TOKEN` (webhook auth). Files `01`/`03`/`08`/`09`.
- **Least-privilege DB access** — a dedicated MySQL user scoped to only the app's database, never `root`. File `09`.
- **SSH/network hardening** — `fail2ban`, UFW `limit` (not just `allow`) on SSH, firewall allowing only SSH/HTTP/HTTPS. File `09`.

## Known gaps / trade-offs

Points not written down anywhere else in the blueprint — either an accepted trade-off worth stating explicitly, or a genuine gap worth closing before launch:

- **CSP is intentionally incomplete.** File `01`'s `Content-Security-Policy` only sets `frame-ancestors`, `object-src`, and `base-uri` — it does **not** restrict `script-src`/`style-src`. This is deliberate, not an oversight: Next's App Router hydration relies on inline scripts, and a strict nonce-based CSP is nontrivial to retrofit onto App Router without breaking hydration. If you tighten this later, budget real time for it — don't treat it as a one-line config change.
- **CSRF relies entirely on cookie `SameSite`, not a token.** There is no separate CSRF token anywhere in this design — state-changing API routes are protected only by NextAuth's JWT session cookie defaulting to `SameSite=Lax`. This is fine as long as that default is never loosened to `None` for convenience (e.g. to support some cross-site embed) — if that ever happens, add real CSRF tokens to admin mutation routes first.
- **No dependency-vulnerability scanning is configured anywhere.** Add `npm audit` (or Dependabot/similar) as an ongoing practice — not a one-time setup task, since new CVEs land in existing pinned dependencies over time.
- **No logging/PII guidance exists in the blueprint.** Don't log full payment payloads (card/UPI details, even from Razorpay's own callback) or return a raw `error.message` to the client from a production 500 handler — both are easy to do by accident once `console.error(err)` becomes a habit during development.

## Verification

- Confirm every admin API route rejects an unauthenticated request with 401, and that a `STAFF`-role session gets 403/blocked write access on Products.
- Send a webhook request with the wrong shared secret — rejected; with the right one but a malformed body — still returns 200 (no retry-storm) while logging the parse failure.
- Feed a `javascript:` URL through the tracking-URL path (order status update, email) — confirm it's dropped, never rendered into an `href`.
- Attempt a wrong password against both a real and a nonexistent email — response times should be statistically indistinguishable.
- Run `npm audit` — confirm it's part of your actual release checklist, not just a one-off check during initial setup.
