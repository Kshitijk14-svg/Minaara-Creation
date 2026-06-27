# Admin Dashboard Slow Rendering — Fix Tracker

## Root Cause Chain

Delays fire in this order when loading `/admin`:

1. **Blank screen during `await auth()`** — `page.tsx` blocks before sending any bytes. No `loading.tsx` exists, so Next.js has nothing to stream. User sees a white screen for the full auth roundtrip.

2. **Large initial JS bundle** — `AdminClient.tsx` statically imports all 8 tab components. Every tab's code is bundled into one chunk and must be downloaded + parsed before React hydrates.

3. **8 simultaneous data fetches on mount** — The `display:none` pattern keeps all tabs mounted immediately. Every tab with a `useEffect` fetch fires on mount, competing with the stats fetch the user actually needs.

4. **OverviewTab gated behind a client fetch** — `loading` starts `true`, entire content area shows skeleton until `/api/admin/stats` returns. That API also calls `await auth()` a second time (redundant session lookup).

5. **Header chrome starts invisible** — Avatar, title, role label, and welcome line all use `initial={{ opacity: 0 }}` in Framer Motion. These only contain session data (already available) but are hidden until hydration + animation fires.

---

## Fixes

### Fix 1 — Add `src/app/admin/loading.tsx` (new file)
Stream an instant fallback skeleton while `page.tsx` awaits `auth()`. Mirrors the visual structure: gradient hero header + tab bar + skeleton rows.

### Fix 2 — Prefetch stats server-side in `page.tsx`, pass as `initialStats` prop
Move the 6 stats DB queries from `OverviewTab`'s `useEffect` into `page.tsx` (session is already verified there — no second `auth()` needed). Pass data as `initialStats` prop through `AdminClient` → `OverviewTab`. In `OverviewTab`, start with `loading = false` and skip the client fetch when `initialStats` is provided.

### Fix 3 — Lazy-import 7 non-overview tabs in `AdminClient.tsx`
Replace static imports with `next/dynamic`. Keeps `OverviewTab` static. The lazy chunks still start loading immediately (all tabs are mounted via `display:none`), so they're ready before the user clicks — but they no longer block the first render.

```ts
import dynamic from 'next/dynamic';
const ProductsTab    = dynamic(() => import('./components/ProductsTab'));
const CollectionsTab = dynamic(() => import('./components/CollectionsTab'));
const CouponsTab     = dynamic(() => import('./components/CouponsTab'));
const OrdersTab      = dynamic(() => import('./components/OrdersTab'));
const BlogTab        = dynamic(() => import('./components/BlogTab'));
const DesignTab      = dynamic(() => import('./components/DesignTab'));
const UsersTab       = dynamic(() => import('./components/UsersTab'));
```

### Fix 4 — Remove `initial={{ opacity: 0 }}` from header chrome in `AdminClient.tsx`
Avatar, role label, h1, and welcome paragraph start invisible despite having no async dependency. Remove `initial={{ opacity: 0 }}` (and `initial={{ scale: 0.8, opacity: 0 }}` on avatar) so structural content is visible the instant React hydrates.

---

## Files to Modify

| File | Change |
|---|---|
| `src/app/admin/loading.tsx` | **New** — streaming skeleton |
| `src/app/admin/page.tsx` | Add stats prefetch, pass `initialStats` |
| `src/app/admin/AdminClient.tsx` | Accept `initialStats`, lazy-import 7 tabs, remove `opacity:0` from chrome |
| `src/app/admin/components/OverviewTab.tsx` | Accept `initialStats` prop, skip client fetch when provided |
