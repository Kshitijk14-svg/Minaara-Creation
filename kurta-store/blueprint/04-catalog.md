# 04 — Product Catalog, Search & Self-Hosted Media

Build the product/collection CRUD API, public listing/search, and the self-hosted image pipeline. Depends on the `products`/`product_size_variants`/`product_images`/`collections` tables from file 02 and `isAuthorized` from file 03.

## Product CRUD (`src/app/api/products/route.ts`, `[id]/route.ts`, `stock/route.ts`)

- `GET /api/products` — public, cursor-paginated (`cursor`, `limit` ≤ 100, filters for `collectionId`/`collectionSlug`/`isActive`/`isFeatured`/`isBestseller`/`isNewArrival`/`search`), response cached with `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`. Delegate the actual query building to a shared `getProductsList()` helper (`src/lib/admin-list-queries.ts`) so the public route and the admin dashboard's product list use identical filtering/sorting logic.
- `POST /api/products` — admin-gated (`isAuthorized(request)`). Validate with a `zod` schema accepting either an explicit `variants: [{size, stock}]` array or a legacy `sizes: Record<string, number>` map (build a `buildSizesMap` helper that normalizes to a fixed `{XS,S,M,L,XL,XXL}` object with a `0` default for missing sizes). Auto-generate a slug from the title plus a random suffix if none is supplied. If a `category` name is given instead of a `collectionId`, upsert a matching `collections` row (slugified from the name) and resolve its id. Wrap the whole product+variants+images insert in **one `db.transaction`** — check for a slug collision inside the transaction and throw a distinguishable `'SLUG_CONFLICT'` error (map to HTTP 409) rather than letting a duplicate-key DB error leak as a generic 500. After commit: invalidate the `products` cache tag, purge the hand-rolled storefront caches (`invalidateStorefrontProducts()`), and `revalidatePath('/')` + `revalidatePath('/collection')` so the change is visible immediately, not after a cache TTL.
- `PATCH /api/products/[id]` — admin-gated, same transactional pattern, replaces variants/images wholesale rather than diffing.
- `DELETE /api/products/[id]` — **soft delete only**: set `deletedAt = new Date()` and `isActive = false`. Never hard-delete a product — `order_items.productId` may reference it, and deleting the row would corrupt historical order display (or you'd need `ON DELETE SET NULL`, which loses the reference entirely). Every product-listing query must filter `isNull(products.deletedAt)`.
- `POST /api/products/stock` — **uncached**, `Cache-Control: no-store`, takes a batch of variant ids and returns live stock counts. This is what the cart and checkout pages poll to revalidate stock client-side before letting a customer proceed — it exists specifically so the client can show "only 2 left" / "out of stock, remove to continue" without waiting for a full product refetch. This is advisory only; the real enforcement is the `FOR UPDATE` lock inside order creation (file 05).

## Collections CRUD

Same shape as products: public cached list/detail, admin-gated write, soft-deactivate (`isActive = false`) on delete if any products still reference the collection rather than a hard delete or FK-violation error.

## Search (`src/app/api/search/route.ts`)

Public, `GET ?q=`. Requires `q.length >= 2` or returns an empty result immediately (avoids a useless full-table scan on a 1-character query).

1. Check Redis (`search:{q.toLowerCase().trim()}`, 60s TTL) — cache hit returns immediately.
2. **Prefer FULLTEXT.** Build a boolean-mode query: split the input on whitespace, strip characters MySQL's boolean-mode parser treats specially (`+-><()~*"@`), and append `*` to each remaining word for prefix matching, joined with a leading `+` per word (all terms required):
   ```ts
   const booleanQuery = q.trim().split(/\s+/).filter(Boolean)
     .map((w) => `+${w.replace(/[+\-><()~*"@]/g, '')}*`).join(' ');
   ```
   Query with `sql`MATCH(${products.title}, ${products.description}) AGAINST(${booleanQuery} IN BOOLEAN MODE)`` OR'd with a `LIKE` on the collection name.
3. **Catch and fall back to a plain `LIKE '%q%'` scan** across title/description/collection name if the FULLTEXT query throws (missing index) or the boolean query came out empty. This means the FULLTEXT migration from file 02 is a pure performance upgrade — search must work correctly even on a database where it was never applied.
4. Cache the successful result (fire-and-forget `.catch(() => null)` — a cache-set failure must never fail the request).

## Self-hosted media pipeline (no CDN/Cloudinary/S3)

### `src/lib/media.ts`
```ts
export const MEDIA_ROOT = process.env.MEDIA_DIR || path.join(process.cwd(), 'uploads');

// Rewrite /media/<uuid>.webp to request a resized variant. Non-/media/ URLs
// pass through unchanged. Use for raw <img> tags that can't use next/image.
export function localResize(url: string, width: number): string {
  if (!url || !url.startsWith('/media/')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}w=${width}`;
}
```
In production, `MEDIA_DIR` **must** point outside the git checkout (e.g. a shared VPS directory) so redeploys never wipe uploaded files.

### `src/lib/sharp-loader.ts` — the bundler workaround

`sharp` is a native addon. A plain `import sharp from 'sharp'` or `require('sharp')` breaks under both Next bundlers: Turbopack silently stubs it to `{}` even with `serverExternalPackages` set; Webpack's handling of `createRequire()` substitutes the call with `void 0` when it can't statically resolve the argument. `new Function(...)`-constructed requires don't work either, because `new Function` always evaluates in *global* scope and Node's `require` is only ever a local per-CJS-module — never global.

The fix that actually works: **direct `eval('require')`**, not `new Function`. Direct `eval` (unlike indirect eval or `new Function`) runs in the *caller's own lexical scope*, so it resolves this module's real local `require` binding — and since the specifier lives inside a plain string literal, neither bundler's static import-graph analysis ever sees a literal `require('sharp')` token to rewrite.

```ts
let sharpModule: typeof import('sharp') | null = null;
export function loadSharp(): typeof import('sharp') {
  if (!sharpModule) {
    // eslint-disable-next-line no-eval
    const dynamicRequire = eval('require') as (specifier: string) => unknown;
    const mod = dynamicRequire('sharp');
    const resolved = typeof mod === 'function' ? mod : (mod as any)?.default;
    if (typeof resolved !== 'function') throw new Error('sharp failed to load: module resolved but is not callable');
    sharpModule = resolved as typeof import('sharp');
  }
  return sharpModule;
}
```
Combine with `serverExternalPackages: ['sharp', ...]` in `next.config.ts` (file 01) — both pieces are required together.

### Upload route (`src/app/api/upload/route.ts`)
Admin-gated (`isAuthorized(request)`). Accept up to 8 files via `FormData`, 10MB max per file. **Sniff magic bytes** — don't trust `file.type` from the client:
```ts
function sniffImage(bytes: Uint8Array): boolean {
  const startsWith = (sig: number[], offset = 0) => sig.every((v, i) => bytes[offset + i] === v);
  return startsWith([0xff,0xd8,0xff]) ||                                 // JPEG
         startsWith([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]) ||        // PNG
         startsWith([0x47,0x49,0x46,0x38]) ||                            // GIF
         (startsWith([0x52,0x49,0x46,0x46]) && startsWith([0x57,0x45,0x42,0x50], 8)); // WEBP
}
```
For each valid file: `sharp(buffer).rotate()` (bakes in EXIF orientation, strips metadata — do this before resize) `.resize({width: 1600, withoutEnlargement: true}).webp({quality: 82})`, save as `<uuid>.webp` under `MEDIA_ROOT/originals/`, return `/media/<uuid>.webp`.

### On-demand resize + serving route (`src/app/media/[...path]/route.ts`)
`export const runtime = 'nodejs'` (native addon, can't run on the edge runtime).

- `GET /media/<uuid>.webp` → streams the original.
- `GET /media/<uuid>.webp?w=300` → resizes on first request, disk-caches under `MEDIA_ROOT/cache/<bucketed-width>/<uuid>.webp`, serves from cache thereafter. `Cache-Control: public, max-age=31536000, immutable` on every response.
- Clamp requested width to `[16, 2000]` and round to the nearest 10 (`WIDTH_BUCKET = 10`) so a client requesting arbitrary widths can't explode the number of cached variants.
- **Filename validation is the entire security boundary**: `FILENAME_RE = /^[a-zA-Z0-9_-]+\.webp$/` plus a `path.relative`-based containment check (`resolveWithinDir`) that rejects anything resolving outside the target directory. Since every uploaded file is always named `<uuid>.webp`, there is never a legitimate reason for the path segment to be anything else — reject early rather than trying to sanitize.
- **De-duplicate concurrent first-requests** for the same resized variant with an in-memory `Map<string, Promise<Buffer>>` keyed by the target cache path — without this, N simultaneous requests for a never-before-resized width would each independently resize and race to write the same file.

### Video upload (parallel pattern)
`src/app/api/upload/video/route.ts` + `src/app/media/videos/[filename]/route.ts` follow the same shape using `fluent-ffmpeg`/`ffmpeg-static`/`@ffprobe-installer/ffprobe` (also in `serverExternalPackages`) for transcode/probe, with the raised `middlewareClientMaxBodySize` from file 01 (Next's default 10MB body cap otherwise silently truncates video uploads before the route ever sees them, and ffprobe reports a "corrupt" file for what's actually just a truncated one).

## Verification

- Upload a JPEG with a wrong `.png` client-reported MIME type — the magic-byte sniff must still classify it correctly (or reject it if it's genuinely not an image).
- Request `/media/<uuid>.webp?w=300` twice concurrently on a cold cache — confirm only one resize actually runs (check a log line or add a temporary counter).
- Search for a 2-character query before and after applying the FULLTEXT migration — same correct results either way.
- Soft-delete a product that has existing orders; confirm the historical order's line item still displays correctly (title/price/image are read from `order_items`, not `products`).
