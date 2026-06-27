import { NextResponse } from 'next/server';
import { db } from '@/db/index';
import { products, collections, productImages } from '@/db/schema';
import { redis } from '@/lib/redis';
import { and, eq, isNull, like, or } from 'drizzle-orm';

const SEARCH_CACHE_TTL = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const cacheKey = `search:${q.toLowerCase().trim()}`;

  try {
    const cached = await redis.get<object[]>(cacheKey);
    if (cached) return NextResponse.json({ results: cached });
  } catch {
    // non-fatal cache miss
  }

  try {
    const term = `%${q}%`;

    const rows = await db
      .select({
        id:             products.id,
        title:          products.title,
        priceINR:       products.priceINR,
        collectionName: collections.name,
        imageUrl:       productImages.url,
      })
      .from(products)
      .leftJoin(collections, eq(products.collectionId, collections.id))
      .leftJoin(productImages, and(
        eq(productImages.productId, products.id),
        eq(productImages.sortOrder, 0),
      ))
      .where(
        and(
          eq(products.isActive, true),
          isNull(products.deletedAt),
          or(
            like(products.title, term),
            like(products.description, term),
            like(collections.name, term),
          )
        )
      )
      .limit(5);

    const results = rows.map((p) => ({
      id:       p.id,
      title:    p.title,
      priceINR: p.priceINR,
      category: p.collectionName || '',
      images:   [{ url: p.imageUrl ?? '' }],
    }));

    redis.set(cacheKey, results, { ex: SEARCH_CACHE_TTL }).catch(() => null);

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Search API Error:', error);
    return NextResponse.json({ results: [], error: 'Search failed' }, { status: 500 });
  }
}
