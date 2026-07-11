import { NextResponse } from 'next/server';
import { db } from '@/db/index';
import { products, collections, productImages } from '@/db/schema';
import { redis } from '@/lib/redis';
import { and, eq, isNull, like, or, sql } from 'drizzle-orm';

const SEARCH_CACHE_TTL = 60;

const SELECT = {
  id:             products.id,
  slug:           products.slug,
  title:          products.title,
  priceINR:       products.priceINR,
  collectionName: collections.name,
  imageUrl:       productImages.url,
} as const;

function baseQuery() {
  return db
    .select(SELECT)
    .from(products)
    .leftJoin(collections, eq(products.collectionId, collections.id))
    .leftJoin(productImages, and(
      eq(productImages.productId, products.id),
      eq(productImages.sortOrder, 0),
    ));
}

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
    // Prefer FULLTEXT (index-backed, no leading-wildcard scan). Build a boolean
    // query with prefix matching; fall back to LIKE if the index is absent.
    const booleanQuery = q
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => `+${w.replace(/[+\-><()~*"@]/g, '')}*`)
      .join(' ');

    let rows;
    try {
      if (!booleanQuery) throw new Error('empty-boolean-query');
      rows = await baseQuery()
        .where(and(
          eq(products.isActive, true),
          isNull(products.deletedAt),
          or(
            sql`MATCH(${products.title}, ${products.description}) AGAINST(${booleanQuery} IN BOOLEAN MODE)`,
            like(collections.name, `%${q}%`),
          ),
        ))
        .limit(5);
    } catch {
      // FULLTEXT index not yet created (or degenerate query) — LIKE fallback.
      const term = `%${q}%`;
      rows = await baseQuery()
        .where(and(
          eq(products.isActive, true),
          isNull(products.deletedAt),
          or(
            like(products.title, term),
            like(products.description, term),
            like(collections.name, term),
          ),
        ))
        .limit(5);
    }

    const results = rows.map((p) => ({
      id:       p.id,
      slug:     p.slug,
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
