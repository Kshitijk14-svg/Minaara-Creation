# Admin Dashboard Console Errors — Bug Tracker

## Root Causes

### 1. Missing `AUTH_SECRET` in `.env.local` (PRIMARY — causes all 401s)
NextAuth v5 requires `AUTH_SECRET` to sign/verify JWT tokens. Without it, `auth()` returns `null`, so every admin route returns 401.

**Fix:** Add to `.env.local`:
```
AUTH_SECRET="<generate with: openssl rand -base64 32>"
```

---

### 2. Admin user has role `CUSTOMER` in DB
All sign-ups default to `role: 'CUSTOMER'`. Even after fixing AUTH_SECRET, admin routes will still return 401 until the account is promoted.

**Fix:** Run in MySQL:
```sql
UPDATE users SET role='SUPER_ADMIN' WHERE email='kshitijmay14@gmail.com';
```

---

### 3. Products route returns 500 (DB issue)
`GET /api/products` is public but throws a DB error. Likely `DATABASE_URL` is misconfigured or `drizzle-kit push` hasn't been run since the Prisma→Drizzle migration (`blog_posts` and `newsletter_subscribers` tables may be missing).

**Fix:**
1. Verify `DATABASE_URL` in `.env.local` points to the live Hostinger DB
2. Run: `npm run db:push`

---

### 4. No try/catch in `/api/admin/users` route (causes "Unexpected end of JSON input")
The users route has no error handling, so any DB exception returns a non-JSON response. `UsersTab.tsx` calls `res.json()` before checking `res.ok`, causing the SyntaxError.

**Code fix A — `src/app/api/admin/users/route.ts`:**
Wrap both GET and PATCH handlers in try/catch (same pattern as `stats/route.ts`).

**Code fix B — `src/app/admin/components/UsersTab.tsx` (line 49-51):**
```ts
// Before:
const data = await res.json();
if (res.ok) setUsers(data.users ?? []);

// After:
if (res.ok) {
  const data = await res.json();
  setUsers(data.users ?? []);
}
```

**Code fix C — `.env.local.example`:**
Add `AUTH_SECRET` entry so it's documented for future deploys.

---

## Affected Errors

| Tab | Error | Cause |
|---|---|---|
| Overview (Stats) | "Failed to fetch stats" | 401 — missing AUTH_SECRET |
| Users | "Unexpected end of JSON input" | No try/catch + res.json() called before res.ok check |
| Products | `!res.ok` thrown | 500 — DB connection/schema issue |
| Coupons | `!res.ok` thrown | 401 — missing AUTH_SECRET |
| Orders | `!res.ok` thrown | 401 — missing AUTH_SECRET |
