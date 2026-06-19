import { NextResponse } from 'next/server';
import { db as prisma } from '@/lib/db';
import { redis } from '@/lib/redis';

const SEARCH_CACHE_TTL = 60; // seconds

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const cacheKey = `search:${q.toLowerCase().trim()}`;

  try {
    const cached = await redis.get<object[]>(cacheKey);
    if (cached) {
      return NextResponse.json({ results: cached });
    }
  } catch {
    // Non-fatal cache miss — proceed to DB
  }

  try {
    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        OR: [
          { title: { contains: q } },
          { collection: { name: { contains: q } } },
          { description: { contains: q } },
        ],
      },
      take: 5,
      select: {
        id: true,
        title: true,
        collection: { select: { name: true } },
        priceINR: true,
        images: { orderBy: { sortOrder: 'asc' } },
      },
    });

    const results = products.map(p => ({
      ...p,
      category: p.collection?.name || '',
    }));

    redis.set(cacheKey, results, { ex: SEARCH_CACHE_TTL }).catch(() => null);

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Search API Error:", error);
    return NextResponse.json({ results: [], error: "Search failed" }, { status: 500 });
  }
}
