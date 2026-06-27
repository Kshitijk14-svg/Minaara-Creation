/**
 * GET /api/collections/[id]  — single collection + paginated products
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { collections, products, productImages, productSizeVariants } from '@/db/schema';
import { cacheGet, cacheSet, CacheKeys, CacheTags } from '@/lib/cache';
import { and, asc, count, desc, eq, inArray, isNull, lt } from 'drizzle-orm';

const COLLECTION_TTL = 3600;
const PRODUCTS_TTL   = 600;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id }   = await params;
    const { searchParams } = new URL(request.url);
    const bySlug   = searchParams.get('bySlug') === 'true';
    const cursor   = searchParams.get('cursor') ?? undefined;
    const limit    = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);

    // ── Collection metadata ─────────────────────────────────────────────────
    const collCacheKey = CacheKeys.collections.single(id);
    let collection     = await cacheGet(collCacheKey);

    if (!collection) {
      const [raw] = bySlug
        ? await db.select().from(collections).where(eq(collections.slug, id)).limit(1)
        : await db.select().from(collections).where(eq(collections.id, id)).limit(1);

      if (!raw) return NextResponse.json({ error: 'Collection not found' }, { status: 404 });

      collection = { ...raw, createdAt: raw.createdAt.toISOString(), updatedAt: raw.updatedAt.toISOString() };
      await cacheSet(collCacheKey, collection, [CacheTags.collections, CacheTags.collection(id)], COLLECTION_TTL);
    }

    // ── Products (cursor-paginated) ─────────────────────────────────────────
    const prodCacheKey   = CacheKeys.collections.products(id, cursor ?? 'start');
    const cachedProducts = await cacheGet(prodCacheKey);
    if (cachedProducts) return NextResponse.json({ collection, ...cachedProducts });

    const collectionId = (collection as any).id as string;

    // Resolve cursor to createdAt for stable pagination
    let cursorDate: Date | undefined;
    if (cursor) {
      const [ci] = await db
        .select({ createdAt: products.createdAt })
        .from(products)
        .where(eq(products.id, cursor))
        .limit(1);
      cursorDate = ci?.createdAt;
    }

    const baseCondition = and(
      eq(products.collectionId, collectionId),
      isNull(products.deletedAt),
      eq(products.isActive, true),
    );

    const paginationCondition = cursorDate
      ? and(baseCondition, lt(products.createdAt, cursorDate))
      : baseCondition;

    const [rows, [{ total }]] = await Promise.all([
      db
        .select({
          id:                products.id,
          title:             products.title,
          slug:              products.slug,
          priceINR:          products.priceINR,
          compareAtPriceINR: products.compareAtPriceINR,
          isFeatured:        products.isFeatured,
          createdAt:         products.createdAt,
        })
        .from(products)
        .where(paginationCondition)
        .orderBy(desc(products.isFeatured), desc(products.createdAt))
        .limit(limit + 1),
      db.select({ total: count() }).from(products).where(baseCondition),
    ]);

    const hasMore    = rows.length > limit;
    const page       = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    // Attach first image + variants per product
    const pageIds = page.map((p) => p.id);
    const imgMap  = new Map<string, { url: string; altText: string | null }>();
    const varMap  = new Map<string, Array<{ size: string; stock: number }>>();

    if (pageIds.length > 0) {
      const [imgRows, varRows] = await Promise.all([
        db.select({ productId: productImages.productId, url: productImages.url, altText: productImages.altText })
          .from(productImages)
          .where(inArray(productImages.productId, pageIds))
          .orderBy(asc(productImages.sortOrder)),
        db.select({ productId: productSizeVariants.productId, size: productSizeVariants.size, stock: productSizeVariants.stock })
          .from(productSizeVariants)
          .where(inArray(productSizeVariants.productId, pageIds)),
      ]);

      for (const img of imgRows) {
        if (!imgMap.has(img.productId)) {
          imgMap.set(img.productId, { url: img.url, altText: img.altText });
        }
      }

      for (const v of varRows) {
        if (!varMap.has(v.productId)) varMap.set(v.productId, []);
        varMap.get(v.productId)!.push({ size: v.size, stock: v.stock });
      }
    }

    const data = page.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
      images:    imgMap.has(p.id) ? [imgMap.get(p.id)!] : [],
      variants:  varMap.get(p.id) ?? [],
    }));

    const productResult = { data, nextCursor, total };
    await cacheSet(
      prodCacheKey,
      productResult,
      [CacheTags.collections, CacheTags.collection(id), CacheTags.products],
      PRODUCTS_TTL,
    );

    return NextResponse.json({ collection, ...productResult });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[GET /api/collections/[id]]', err);
    return NextResponse.json({ error: 'Failed to fetch collection' }, { status: 500 });
  }
}
