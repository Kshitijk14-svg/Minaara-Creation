/**
 * GET  /api/products  — cursor-paginated list (public, cached)
 * POST /api/products  — create product + variants + images (admin)
 */
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { isAuthorized } from '@/lib/api-auth';
import {
  cacheGet,
  cacheSet,
  invalidateTags,
  CacheKeys,
  CacheTags,
} from '@/lib/cache';

const PRODUCTS_TTL = 600; // 10 min

// ── Zod schemas ──────────────────────────────────────────────────────────────

const SizeVariantSchema = z.object({
  size: z.enum(['XS', 'S', 'M', 'L', 'XL', 'XXL']),
  stock: z.number().int().min(0),
});

const ImageSchema = z.object({
  url: z.string().url(),
  altText: z.string().optional(),
  sortOrder: z.number().int().min(0).optional().default(0),
});

const CreateProductSchema = z.object({
  title: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, digits, and hyphens').optional(),
  description: z.string().min(1),
  priceINR: z.number().positive(),
  compareAtPriceINR: z.number().positive().nullable().optional(),
  collectionId: z.string().uuid().optional(),
  category: z.string().min(1).optional(),
  isActive: z.boolean().optional().default(true),
  isFeatured: z.boolean().optional().default(false),
  variants: z.array(SizeVariantSchema).optional(),
  sizes: z.record(z.string(), z.number()).optional(),
  images: z.any(),
});

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cursor       = searchParams.get('cursor') ?? undefined;
    const limit        = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);
    const collectionId = searchParams.get('collectionId') ?? undefined;
    const collectionSlug = searchParams.get('collection') ?? undefined;
    const isActiveParam = searchParams.get('isActive');
    const isFeatured   = searchParams.get('isFeatured');
    const search       = searchParams.get('search') ?? undefined;

    const params = new URLSearchParams({
      cursor: cursor ?? '',
      limit: String(limit),
      collectionId: collectionId ?? '',
      collectionSlug: collectionSlug ?? '',
      isActive: isActiveParam ?? '',
      isFeatured: isFeatured ?? '',
      search: search ?? '',
    }).toString();

    const cacheKey = CacheKeys.products.list(params);
    const cached = await cacheGet(cacheKey);
    if (cached) return NextResponse.json(cached);

    // Build where clause
    const where: Record<string, unknown> = { deletedAt: null };
    if (collectionId) where.collectionId = collectionId;
    if (collectionSlug) {
      where.collection = { slug: collectionSlug };
    }
    if (isActiveParam !== null && isActiveParam !== '') {
      where.isActive = isActiveParam === 'true';
    }
    if (isFeatured === 'true') where.isFeatured = true;
    if (search) {
      where.title = { contains: search };
    }

    const [products, total] = await Promise.all([
      db.product.findMany({
        where,
        select: {
          id: true,
          title: true,
          slug: true,
          description: true,
          priceINR: true,
          compareAtPriceINR: true,
          collectionId: true,
          isActive: true,
          isFeatured: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          collection: { select: { id: true, name: true, slug: true } },
          variants: { select: { id: true, productId: true, size: true, stock: true }, orderBy: { size: 'asc' } },
          images: { select: { id: true, productId: true, url: true, altText: true, sortOrder: true }, orderBy: { sortOrder: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit + 1, // fetch one extra to detect next page
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      db.product.count({ where }),
    ]);

    const hasMore = products.length > limit;
    const page    = hasMore ? products.slice(0, limit) : products;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    const result = {
      data: page.map((p) => {
        const sizes: Record<string, number> = {
          XS: p.variants.find((v) => v.size === 'XS')?.stock ?? 0,
          S: p.variants.find((v) => v.size === 'S')?.stock ?? 0,
          M: p.variants.find((v) => v.size === 'M')?.stock ?? 0,
          L: p.variants.find((v) => v.size === 'L')?.stock ?? 0,
          XL: p.variants.find((v) => v.size === 'XL')?.stock ?? 0,
          XXL: p.variants.find((v) => v.size === 'XXL')?.stock ?? 0,
        };

        return {
          ...p,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
          deletedAt: p.deletedAt?.toISOString() ?? null,
          category: p.collection?.name || '',
          sizes,
          images: p.images.map((img) => img.url),
          normalizedImages: p.images,
        };
      }),
      nextCursor,
      total,
    };

    await cacheSet(cacheKey, result, [CacheTags.products], PRODUCTS_TTL);
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[GET /api/products]', err);
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
  }
}

// ── POST ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: unknown = await request.json();
    const parsed = CreateProductSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', issues: parsed.error.issues }, { status: 400 });
    }

    const { variants, sizes, images, category, collectionId, ...productData } = parsed.data;

    // Determine collectionId
    let finalCollectionId = collectionId;
    if (!finalCollectionId && category) {
      const slug = category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const collection = await db.collection.upsert({
        where: { slug },
        update: {},
        create: {
          name: category,
          slug,
          isActive: true,
          sortOrder: 0,
        },
      });
      finalCollectionId = collection.id;
    }

    if (!finalCollectionId) {
      return NextResponse.json({ error: 'Collection ID or Category name is required' }, { status: 400 });
    }

    // Determine variants
    let finalVariants: { size: 'XS'|'S'|'M'|'L'|'XL'|'XXL', stock: number }[] = [];
    if (variants && variants.length > 0) {
      finalVariants = variants;
    } else if (sizes) {
      finalVariants = Object.entries(sizes).map(([sz, stock]) => ({
        size: sz as any,
        stock,
      }));
    }

    // Determine images
    let finalImages: { url: string; altText?: string; sortOrder: number }[] = [];
    if (Array.isArray(images)) {
      finalImages = images.map((img: any, i: number) => {
        if (typeof img === 'string') {
          return { url: img, sortOrder: i };
        }
        return { url: img.url, altText: img.altText, sortOrder: img.sortOrder ?? i };
      });
    }

    // Auto-generate slug if not provided
    const finalSlug = productData.slug || productData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Math.random().toString(36).substring(2, 7);

    // ACID transaction: create product + variants + images atomically
    const product = await db.$transaction(async (tx) => {
      // Ensure slug is unique
      const existing = await tx.product.findUnique({ where: { slug: finalSlug } });
      if (existing) {
        throw new Error(`SLUG_CONFLICT: Slug "${finalSlug}" already exists`);
      }

      return tx.product.create({
        data: {
          ...productData,
          slug: finalSlug,
          collectionId: finalCollectionId!,
          variants: {
            create: finalVariants.map((v) => ({ size: v.size, stock: v.stock })),
          },
          images: {
            create: finalImages.map((img) => ({
              url: img.url,
              altText: img.altText || null,
              sortOrder: img.sortOrder,
            })),
          },
        },
        include: {
          collection: { select: { id: true, name: true, slug: true } },
          variants: true,
          images: { orderBy: { sortOrder: 'asc' } },
        },
      });
    });

    // Invalidate products cache
    await invalidateTags([CacheTags.products]);
    revalidatePath('/');

    const mappedSizes: Record<string, number> = {
      XS: product.variants.find((v) => v.size === 'XS')?.stock ?? 0,
      S: product.variants.find((v) => v.size === 'S')?.stock ?? 0,
      M: product.variants.find((v) => v.size === 'M')?.stock ?? 0,
      L: product.variants.find((v) => v.size === 'L')?.stock ?? 0,
      XL: product.variants.find((v) => v.size === 'XL')?.stock ?? 0,
      XXL: product.variants.find((v) => v.size === 'XXL')?.stock ?? 0,
    };

    return NextResponse.json(
      {
        product: {
          ...product,
          createdAt: product.createdAt.toISOString(),
          updatedAt: product.updatedAt.toISOString(),
          category: product.collection?.name || '',
          sizes: mappedSizes,
          images: product.images.map((img) => img.url),
          normalizedImages: product.images,
        },
      },
      { status: 201 },
    );
  } catch (err: any) {
    if (err?.message?.startsWith('SLUG_CONFLICT')) {
      return NextResponse.json({ error: err.message.replace('SLUG_CONFLICT: ', '') }, { status: 409 });
    }
    if (process.env.NODE_ENV !== 'production') console.error('[POST /api/products]', err);
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 });
  }
}
