/**
 * GET /api/collections/[id]  — single collection + paginated products
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { cacheGet, cacheSet, CacheKeys, CacheTags } from '@/lib/cache';

const COLLECTION_TTL = 3600;
const PRODUCTS_TTL   = 600;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const bySlug  = searchParams.get('bySlug') === 'true';
    const cursor  = searchParams.get('cursor') ?? undefined;
    const limit   = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);

    // Collection metadata
    const collCacheKey = CacheKeys.collections.single(id);
    let collection = await cacheGet(collCacheKey);

    if (!collection) {
      const raw = bySlug
        ? await db.collection.findUnique({ where: { slug: id } })
        : await db.collection.findUnique({ where: { id } });

      if (!raw) return NextResponse.json({ error: 'Collection not found' }, { status: 404 });

      collection = {
        ...raw,
        createdAt: raw.createdAt.toISOString(),
        updatedAt: raw.updatedAt.toISOString(),
      };
      await cacheSet(collCacheKey, collection, [CacheTags.collections, CacheTags.collection(id)], COLLECTION_TTL);
    }

    // Products in collection — cursor paginated
    const prodCacheKey = CacheKeys.collections.products(id, cursor ?? 'start');
    const cachedProducts = await cacheGet(prodCacheKey);
    if (cachedProducts) {
      return NextResponse.json({ collection, ...cachedProducts });
    }

    const collectionId = (collection as any).id as string;
    const [products, total] = await Promise.all([
      db.product.findMany({
        where: { collectionId, deletedAt: null, isActive: true },
        select: {
          id: true,
          title: true,
          slug: true,
          priceINR: true,
          compareAtPriceINR: true,
          isFeatured: true,
          images: { select: { url: true, altText: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
          variants: { select: { size: true, stock: true } },
        },
        orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      db.product.count({ where: { collectionId, deletedAt: null, isActive: true } }),
    ]);

    const hasMore    = products.length > limit;
    const page       = hasMore ? products.slice(0, limit) : products;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    const productResult = { data: page, nextCursor, total };
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
