# 06 — Admin Dashboard & Homepage CMS

Build a single-route, tabbed admin dashboard plus a JSON-blob homepage CMS that lets a non-technical admin edit the storefront's content without a deploy. Depends on `isAuthorized`/roles (file 03), `design_configs`/`haveli_hotspots` (file 02), and the product/collection/coupon CRUD routes (file 04/05).

## Dashboard shell — one route, client-side tabs

`src/app/admin/page.tsx` is a **server component** that:
1. Calls `await auth()`, redirects to `/login` if no session, redirects to `/` if `role` isn't one of `SUPER_ADMIN`/`ADMIN`/`STAFF`.
2. Server-prefetches the Overview tab's stats (`getAdminStats()`) so the default landing tab paints with real numbers instead of a skeleton — wrap in `.catch(() => null)` so a stats-query hiccup never fails the whole page.
3. Reads a `?tab=` search param and, if it matches a data-heavy tab (`products`/`collections`/`orders`/`coupons`), server-prefetches that tab's first page too — so a direct link or reload paints real data instead of a skeleton → client-fetch waterfall. Every other tab lazy-fetches client-side on first visit.
4. Renders `<AdminClient session={session} initialStats={...} initial...Data={...} />`.

`AdminClient.tsx` (`'use client'`) holds `useState<AdminTab>` for which tab is active, and `dynamic()`-imports every tab **except** Overview (which ships in the initial bundle since it's the default landing tab):
```ts
const ProductsTab = dynamic(() => import('./components/ProductsTab'));
// ...one per tab
```
Render **all visited tabs simultaneously**, toggling visibility with `display: none` rather than conditionally mounting/unmounting — this means switching tabs never re-fetches or re-renders from scratch, at the cost of keeping more components in memory. Sync the active tab into the URL's `?tab=` param so it survives a reload/share.

Tabs to build: **Overview**, **Products**, **Collections**, **Coupons**, **Orders**, **Blog** (journal/content), **Design** (homepage CMS), **Testimonials**, **Lookbook/Hotspots** (the interactive "shop the look" editor), **Users** (role management).

## CRUD wiring convention — API routes, not Server Actions

Every admin mutation goes through a `fetch()` call from a `'use client'` component to a REST-ish API route handler (`src/app/api/...`) — **do not use Next.js Server Actions (`"use server"`) anywhere in this codebase.** Validation happens server-side with `zod` inside each route handler. This keeps a single validation/auth pattern (`isAuthorized`) reusable across both the admin UI and any future non-browser client (mobile app, CLI script) hitting the same endpoints.

## Role gating within admin

- `STAFF` role is **read-only** on Products (and similarly sensitive areas) — gate write actions in the tab component with a `canWrite = role !== 'STAFF'` check, in addition to the route-level `isAuthorized(request)` (which defaults to `'staff_or_above'` — broaden or narrow the level per-route as the specific action warrants, e.g. use `'admin'` for role management itself).
- Full write access: `ADMIN`, `SUPER_ADMIN`.

## Shared admin UI primitives

Build these once in `src/app/admin/components/shared/` and reuse across every tab:
- `AdminModal` — generic modal wrapper for create/edit/confirm dialogs.
- `AdminTable` — sortable/paginated table shell.
- `FormField` — labeled input wrapper with validation-error display.
- `ArrayFieldEditor` — add/remove/reorder rows for JSON-array config fields (used heavily by the Design tab).
- `ImageUploader` / `VideoUploader` — wraps the upload routes from file 04, shows preview via `localResize()`.
- `ProductPicker` — searchable product-select (used by the Hotspot editor and coupon-eligibility UIs if you add them).
- `StatusBadge` — colored pill for order/coupon status enums.
- `ConfirmInline` — inline "are you sure?" confirmation before a destructive action, instead of a native `confirm()` dialog.
- `LoadingSkeleton` — shared skeleton shape for tabs mid-fetch.

## Homepage CMS — `design_configs` (`src/app/api/config/design/route.ts`)

A single-row table (file 02) holding every editable homepage section as a JSON blob. This route is the entire CMS backend:

- `GET` — **public**, Redis-cached (`design_config` key, 1hr TTL, cache-read/write wrapped so a Redis failure just means a DB read, never an error). Reads the one row (`id = 'current_config'`), converts nullable JSON columns to a typed `DesignConfig` response shape.
- `PATCH` — gated `isAuthorized(request, 'staff_or_above')`. Validate a big `zod` object where **every field is `.optional()`** — the route does a partial update, only writing the keys actually present in the request body:
  ```ts
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.heroBanners !== undefined) updateData.heroBanners = parsed.data.heroBanners;
  // ...one guarded assignment per field
  ```
  After the update: `redis.del('design_config')` (invalidate the cache) **and** `revalidatePath('/')` (invalidate Next's own page cache) — both are needed, since they're independent caching layers.

Define one `zod` schema per JSON-blob shape (hero banners, hero content, USP items, marquee words, about panels, editorial stories, stats, footer content, the lookbook-banner config, hidden-sections list) matching the column shapes from file 02.

### Section-visibility toggle (`hiddenSections`)

Maintain a fixed list of toggleable homepage sections in one place, e.g. `src/lib/design-defaults.ts`:
```ts
export const HOME_SECTION_TOGGLES = [
  { key: 'usp', label: 'USP Strip' },
  { key: 'marquee', label: 'Brand Marquee' },
  { key: 'collections', label: 'Collections Showcase' },
  { key: 'newArrivals', label: 'New Arrivals' },
  { key: 'lookbook', label: 'Lookbook Banner' },
  { key: 'stories', label: 'Editorial Stories' },
  { key: 'bestsellers', label: 'Bestsellers' },
  { key: 'stats', label: 'Stats Counter' },
  { key: 'testimonials', label: 'Testimonials' },
  { key: 'newsletter', label: 'Newsletter Signup' },
] as const;
```
Deliberately **exclude** structural sections that anchor the page layout (Hero, a pinned "Featured"/"About" scroll section, the Footer) from this list — those aren't optional, so don't give the admin a toggle that can put the page in a broken layout state. Derive the `PatchDesignConfigSchema`'s `hiddenSections` field as `z.array(z.enum(HOME_SECTION_TOGGLES.map(s => s.key)))` so the API rejects unknown section keys.

### Default content fallback

Keep a `src/lib/design-defaults.ts` with hardcoded default copy for every section (hero text, USP items, about panels, etc.), used by the public homepage whenever a `design_configs` field is `null` (i.e. before the admin's first save). Keep these deliberately in sync with whatever "new item" template the Design tab's editor pre-fills — drift between the two means the admin's "add new item" button and the actual public fallback disagree on shape.

## Lookbook / interactive hotspots (`src/app/api/haveli-hotspots/route.ts` + `[id]/route.ts`)

An interactive full-bleed lookbook image with clickable pins that link to specific products (the source project calls this feature "The Haveli Edit" — pick your own name for the new brand).

- `haveli_hotspots` rows store `x`/`y` as 0–100 percentage coordinates within the banner image (resolution-independent).
- `GET` (public) joins each hotspot to its product's title/slug/price/first image so the storefront can render a rich preview card on hover/click without a second round-trip.
- `POST`/`PATCH`/`DELETE` (admin-gated) — the admin UI is a click-to-place editor: click anywhere on the banner image to create a pin at that percentage position, drag to reposition, assign a product via `ProductPicker`.
- Invalidate the dedicated storefront hotspot cache key (not the generic tag system — see file 08's `StorefrontKeys`) and `revalidatePath('/')` on any mutation.

## Verification

- Log in as `STAFF` — confirm the Products tab renders read-only (no create/edit/delete controls) while Orders/Overview remain fully visible.
- Edit and save a homepage section via the Design tab, then load the public homepage in a fresh tab — the change appears immediately (proving both the Redis and Next page cache were invalidated).
- Toggle a section off in `hiddenSections` — it disappears from the public homepage; toggle it back on — it reappears with its previously-saved content intact (not reset to defaults).
- Place a hotspot pin, reload the lookbook page — it persists at the same coordinates and links to the correct product.
