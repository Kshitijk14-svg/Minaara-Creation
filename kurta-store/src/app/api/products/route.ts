import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { redis } from '@/lib/redis';
import type { Product } from '@/types/schema';

const CACHE_KEY = 'products_list';
const CACHE_TTL_SECONDS = 600; // 10 minutes

const CreateProductSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  priceINR: z.number().positive(),
  images: z.array(z.string().url()),
  sizes: z.record(z.string(), z.number().int().min(0)),
  category: z.string().min(1),
  isActive: z.boolean().optional().default(true),
});

function dbProductToSchema(p: {
  id: string;
  title: string;
  description: string;
  priceINR: number;
  images: unknown;
  sizes: unknown;
  category: string;
  isActive: boolean;
  createdAt: Date;
}): Product {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    priceINR: p.priceINR,
    images: p.images as string[],
    sizes: p.sizes as Product['sizes'],
    category: p.category,
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const isActiveParam = searchParams.get('isActive');
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0', 10);

    // Build cache key including filters
    const cacheKey = `${CACHE_KEY}:${category ?? 'all'}:${isActiveParam ?? 'all'}:${limit}:${offset}`;

    // Check Redis cache
    const cached = await redis.get<{ products: Product[]; total: number }>(cacheKey).catch(() => null);
    if (cached) {
      return NextResponse.json(cached);
    }

    const where: { category?: string; isActive?: boolean } = {};
    if (category) where.category = category;
    if (isActiveParam !== null) where.isActive = isActiveParam === 'true';

    const [products, total] = await Promise.all([
      db.product.findMany({
        where,
        select: {
          id: true,
          title: true,
          description: true,
          priceINR: true,
          images: true,
          sizes: true,
          category: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.product.count({ where }),
    ]);

    const result = {
      products: products.map(dbProductToSchema),
      total,
    };

    // Cache result
    await redis.set(cacheKey, result, { ex: CACHE_TTL_SECONDS }).catch(() => null);

    return NextResponse.json(result);
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[GET /api/products]', err);
    }
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Admin auth
    const authHeader = request.headers.get('Authorization');
    const expectedToken = `Bearer ${process.env.ADMIN_SECRET_KEY}`;
    if (!authHeader || authHeader !== expectedToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: unknown = await request.json();
    const parsed = CreateProductSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', issues: parsed.error.issues }, { status: 400 });
    }

    const product = await db.product.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description,
        priceINR: parsed.data.priceINR,
        images: parsed.data.images,
        sizes: parsed.data.sizes,
        category: parsed.data.category,
        isActive: parsed.data.isActive,
      },
      select: {
        id: true,
        title: true,
        description: true,
        priceINR: true,
        images: true,
        sizes: true,
        category: true,
        isActive: true,
        createdAt: true,
      },
    });

    // Invalidate all product list cache keys by pattern — use a simple wildcard delete
    const keys = await redis.keys(`${CACHE_KEY}:*`).catch(() => [] as string[]);
    if (keys.length > 0) {
      await redis.del(...keys).catch(() => null);
    }

    return NextResponse.json({ product: dbProductToSchema(product) }, { status: 201 });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[POST /api/products]', err);
    }
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 });
  }
}
