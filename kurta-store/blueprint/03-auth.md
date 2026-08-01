# 03 — Authentication & Route Protection

Build authentication on **NextAuth v5 with Credentials providers only** — no OAuth, no third-party identity provider, no database sessions. Depends on the `users` and `otps` tables from file 02.

## `src/lib/password.ts` — custom scrypt hashing

Do not use bcrypt. Use Node's built-in `crypto.scrypt`, with a **self-describing stored format** so hashing parameters can change later without invalidating already-hashed passwords:

```
scrypt$<N>$<r>$<p>$<salt-b64>$<hash-b64>
```

Parameters: `N = 32768` (2^15), `r = 8`, `p = 1`, key length 64 bytes.

```ts
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), derived.toString('base64')].join('$');
}
```

`verifyPassword(password, stored)` must **never throw and never fast-return** on a missing/malformed hash — always run an equivalent `scrypt` computation on a dummy salt before returning `false`, so a nonexistent account or a not-yet-password-set account isn't distinguishable from a wrong password by response timing. Always `password.normalize('NFKC')` before hashing/verifying (handles Unicode input consistently across clients).

## `src/lib/auth.ts` — NextAuth config

`session: { strategy: 'jwt' }` (not database sessions), `pages: { signIn: '/login' }`.

Two `CredentialsProvider`s:

### Provider `id: "otp"` — signup + forgot-password
Both flows share one email-OTP verification step, then diverge based on an **explicit `mode` field** (`'SIGNUP' | 'FORGOT'`) sent by the frontend. Do not infer which flow is happening from which optional fields are present (e.g. presence of `newPassword`) — an explicit mode avoids a class of bug where the two flows get confused with each other.

Verification logic (`verifyOtpCode(email, otp)`):
1. Check a Redis-backed brute-force lockout counter (`otp_fail:<email>`) — if `>= 5` failed attempts within the last 15 minutes, throw a custom `OtpLocked extends CredentialsSignin` error with `code = 'otp_locked'` so the frontend can show "too many attempts" distinctly from "wrong code" (both currently look identical to a generic NextAuth `CredentialsSignin`).
2. Load the (unique, one-per-email) row from `otps`. If missing or expired: delete it if present, register a failure, return `false`.
3. Constant-time compare the stored code against the given one via `crypto.timingSafeEqual` (compare buffer lengths first — `timingSafeEqual` throws on mismatched lengths).
4. On success: delete the OTP row, clear the fail counter, return `true`.
5. If Redis is unreachable when checking the lockout counter, **swallow the error and continue** — the DB checks still apply; don't let a Redis outage block login entirely.

On successful OTP verification: `FORGOT` mode updates `users.passwordHash` for the existing email; `SIGNUP` mode does an upsert insert (`onDuplicateKeyUpdate` as a no-op) creating a `CUSTOMER`-role user.

### Provider `id: "password"` — standard login
Always calls `verifyPassword(password, user?.passwordHash ?? null)` **even when no user was found** — never short-circuit on "user doesn't exist" before calling verify, for the same timing-attack reason as above.

### Callbacks
```ts
callbacks: {
  async jwt({ token, user }) {
    if (user) { token.role = user.role; token.name = user.name; }
    return token;
  },
  async session({ session, token }) {
    if (session.user) { session.user.role = token.role; session.user.name = token.name; }
    return session;
  },
}
```
NextAuth's default `User`/`Session` types don't have a `role` field — you'll need `// @ts-ignore` (or a proper module augmentation in `next-auth.d.ts`) at each assignment.

## `src/lib/api-auth.ts` — shared route-auth helpers

Centralize this so every protected API route doesn't reinvent it:

```ts
export type AuthLevel = 'admin' | 'staff_or_above' | 'any_logged_in';

export function safeEqual(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a), bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// True only for a trusted server-to-server caller — gates endpoints (e.g. order
// creation) that must never be hit directly by a browser.
export function isInternalRequest(request: NextRequest): boolean {
  return safeEqual(request.headers.get('x-internal-key'), process.env.INTERNAL_API_KEY);
}

// True if the request carries a valid admin Bearer token OR a session with
// sufficient role.
export async function isAuthorized(request: NextRequest, level: AuthLevel = 'staff_or_above'): Promise<boolean> {
  const authHeader = request.headers.get('Authorization');
  const adminSecret = process.env.ADMIN_SECRET_KEY;
  if (adminSecret && authHeader?.startsWith('Bearer ') && safeEqual(authHeader.slice(7), adminSecret)) {
    return true;
  }
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!role) return false;
  if (level === 'staff_or_above') return ['SUPER_ADMIN','ADMIN','STAFF'].includes(role);
  if (level === 'admin') return ['SUPER_ADMIN','ADMIN'].includes(role);
  if (level === 'any_logged_in') return !!session?.user;
  return false;
}

export async function getSessionUserId(): Promise<string | null> {
  return ((await auth())?.user as any)?.id ?? null;
}
```

The **Bearer-token-OR-session** pattern matters: it lets cron jobs and server-to-server calls (file 08) hit admin-gated routes without a browser session, while normal admin UI traffic authenticates via the session cookie.

## Route protection strategy — no middleware auth

There is **no `middleware.ts`/`proxy.ts` auth check**. `src/proxy.ts` (file 01/10) is reserved purely for rate limiting. Protection happens at two levels instead:

- **Pages**: each protected server component calls `await auth()` directly and redirects:
  ```ts
  const session = await auth();
  if (!session?.user) redirect('/login');
  const role = (session.user as any).role;
  if (!['SUPER_ADMIN','ADMIN','STAFF'].includes(role)) redirect('/');
  ```
- **API routes**: call `isAuthorized(request, level)` at the top of the handler and return 401 if false.

This keeps auth logic colocated with the thing it protects instead of a central rule table that can drift out of sync with new routes.

## OTP send endpoint — separate from NextAuth

`POST /api/auth/send-otp` (not part of the NextAuth catch-all) generates a CSPRNG 6-digit code via `crypto.randomInt`, is rate-limited **3 requests / 10 minutes per email** (Upstash `Ratelimit` when configured, else the in-memory fallback from file 10 — same pattern, different key: per-email here, per-IP in `proxy.ts`), and emails it via `sendEmail()` (file 08).

## Verification

- Sign up via OTP: request a code, verify it, confirm a `CUSTOMER` row appears in `users` with a `passwordHash` set.
- Forgot-password via OTP updates the existing user's hash without creating a duplicate row.
- 6 wrong OTP attempts in a row locks the email for 15 minutes (`otp_locked` surfaces distinctly from a generic wrong-code error).
- Password login for a nonexistent email and a real email with a wrong password take roughly the same wall-clock time.
- An unauthenticated request to an admin API route returns 401; the same request with `Authorization: Bearer <ADMIN_SECRET_KEY>` succeeds.
