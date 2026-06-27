/**
 * GET  /api/products  — cursor-paginated list (public, cached)
 * POST /api/products  — create product + variants + images (admin)
 */
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db/index';
import { products, collections, productSizeVariants, productImages } from '@/db/schema';
import { isAuthorized } from '@/lib/api-auth';
import {
  cacheGet, cacheSet, invalidateTags,
  CacheKeys, CacheTags,
} from '@/lib/cache';
import { and, asc, count, desc, eq, inArray, isNull, like, lt } from 'drizzle-orm';
import { randomUUID } from 'crypto';

const PRODUCTS_TTL = 600;

const SizeVariantSchema = z.object({
  size:  z.enum(['XS', 'S', 'M', 'L', 'XL', 'XXL']),
  stock: z.number().int().min(0),
});

const CreateProductSchema = z.object({
  title:             z.string().min(1).max(255),
  slug:              z.string().min(1).max(255).regex(/^[a-z0-9-]+$/).optional(),
  description:       z.string().min(1),
  priceINR:          z.number().positive(),
  compareAtPriceINR: z.number().positive().nullable().optional(),
  collectionId:      z.string().uuid().optional(),
  category:          z.string().min(1).optional(),
  isActive:          z.boolean().optional().default(true),
  isFeatured:        z.boolean().optional().default(false),
  variants:          z.array(SizeVariantSchema).optional(),
  sizes:             z.record(z.string(), z.number()).optional(),
  images:            z.any(),
});

function buildSizesMap(variants: Array<{ size: string; stock: number }>) {
  const map: Record<string, number> = { XS: 0, S: 0, M: 0, L: 0, XL: 0, XXL: 0 };
  for (const v of variants) map[v.size] = v.stock;
  return map;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cursor         = searchParams.get('cursor') ?? undefined;
    const limit          = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);
    const collectionId   = searchParams.get('collectionId') ?? undefined;
    const collectionSlug = searchParams.get('collection') ?? undefined;
    const isActiveParam  = searchParams.get('isActive');
    const isFeatured     = searchParams.get('isFeatured');
    const search         = searchParams.get('search') ?? undefined;

    const params = new URLSearchParams({
      cursor: cursor ?? '', limit: String(limit),
      collectionId: collectionId ?? '', collectionSlug: collectionSlug ?? '',
      isActive: isActiveParam ?? '', isFeatured: isFeatured ?? '', search: search ?? '',
    }).toString();

    const cacheKey = CacheKeys.products.list(params);
    const cached   = await cacheGet(cacheKey);
    if (cached) return NextResponse.json(cached);

    // Resolve cursor
    let cursorDate: Date | undefined;
    if (cursor) {
      const [ci] = await db
        .select({ createdAt: products.createdAt })
        .from(products)
        .where(eq(products.id, cursor))
        .limit(1);
      cursorDate = ci?.createdAt;
    }

    // Resolve collection slug → id if needed
    let resolvedCollectionId = collectionId;
    if (collectionSlug && !resolvedCollectionId) {
      const [col] = await db
        .select({ id: collections.id })
        .from(collections)
        .where(eq(collections.slug, collectionSlug))
        .limit(1);
      resolvedCollectionId = col?.id;
    }

    const conditions = and(
      isNull(products.deletedAt),
      resolvedCollectionId ? eq(products.collectionId, resolvedCollectionId) : undefined,
      isActiveParam !== null && isActiveParam !== '' ? eq(products.isActive, isActiveParam === 'true') : undefined,
      isFeatured === 'true' ? eq(products.isFeatured, true) : undefined,
      search ? like(products.title, `%${search}%`) : undefined,
      cursorDate ? lt(products.createdAt, cursorDate) : undefined,
    );

    const countConditions = and(
      isNull(products.deletedAt),
      resolvedCollectionId ? eq(products.collectionId, resolvedCollectionId) : undefined,
      isActiveParam !== null && isActiveParam !== '' ? eq(products.isActive, isActiveParam === 'true') : undefined,
      isFeatured === 'true' ? eq(products.isFeatured, true) : undefined,
      search ? like(products.title, `%${search}%`) : undefined,
    );

    const [rows, [{ total }]] = await Promise.all([
      db.select({
        id:                products.id,
        title:             products.title,
        slug:              products.slug,
        description:       products.description,
        priceINR:          products.priceINR,
        compareAtPriceINR: products.compareAtPriceINR,
        collectionId:      products.collectionId,
        isActive:          products.isActive,
        isFeatured:        products.isFeatured,
        createdAt:         products.createdAt,
        updatedAt:         products.updatedAt,
        deletedAt:         products.deletedAt,
        collectionName:    collections.name,
        collectionSlug:    collections.slug,
      })
        .from(products)
        .leftJoin(collections, eq(products.collectionId, collections.id))
        .where(conditions)
        .orderBy(desc(products.createdAt))
        .limit(limit + 1),
      db.select({ total: count() }).from(products).where(countConditions),
    ]);

    const hasMore    = rows.length > limit;
    const page       = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    // Fetch variants + images for the page
    const pageIds = page.map((p) => p.id);
    const variantMap = new Map<string, Array<{ id: string; productId: string; size: string; stock: number }>>();
    const imageMap   = new Map<string, Array<{ id: string; productId: string; url: string; altText: string | null; sortOrder: number }>>();

    if (pageIds.length > 0) {
      const [varRows, imgRows] = await Promise.all([
        db.select({
          id: productSizeVariants.id,
          productId: productSizeVariants.productId,
          size: productSizeVariants.size,
          stock: productSizeVariants.stock,
        })
          .from(productSizeVariants)
          .where(inArray(productSizeVariants.productId, pageIds))
          .orderBy(asc(productSizeVariants.size)),
        db.select({
          id: productImages.id,
          productId: productImages.productId,
          url: productImages.url,
          altText: productImages.altText,
          sortOrder: productImages.sortOrder,
        })
          .from(productImages)
          .where(inArray(productImages.productId, pageIds))
          .orderBy(asc(productImages.sortOrder)),
      ]);

      for (const v of varRows) {
        if (!variantMap.has(v.productId)) variantMap.set(v.productId, []);
        variantMap.get(v.productId)!.push(v);
      }
      for (const img of imgRows) {
        if (!imageMap.has(img.productId)) imageMap.set(img.productId, []);
        imageMap.get(img.productId)!.push(img);
      }
    }

    const result = {
      data: page.map((p) => {
        const variants = variantMap.get(p.id) ?? [];
        const images   = imageMap.get(p.id)   ?? [];
        return {
          ...p,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
          deletedAt: p.deletedAt?.toISOString() ?? null,
          category:  p.collectionName || '',
          collection: {
            id:   p.collectionId,
            name: p.collectionName,
            slug: p.collectionSlug,
          },
          sizes:            buildSizesMap(variants),
          variants,
          images:           images.map((img) => img.url),
          normalizedImages: images,
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

export async function POST(request: NextRequest) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body   = await request.json();
    const parsed = CreateProductSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', issues: parsed.error.issues }, { status: 400 });
    }

    const { variants, sizes, images, category, collectionId, ...productData } = parsed.data;

    // Resolve collection
    let finalCollectionId = collectionId;
    if (!finalCollectionId && category) {
      const slug = category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      await db.insert(collections)
        .values({ id: randomUUID(), name: category, slug, isActive: true, sortOrder: 0 })
        .onDuplicateKeyUpdate({ set: { name: category } });
      const [col] = await db.select({ id: collections.id }).from(collections).where(eq(collections.slug, slug)).limit(1);
      finalCollectionId = col?.id;
    }

    if (!finalCollectionId) {
      return NextResponse.json({ error: 'Collection ID or Category name is required' }, { status: 400 });
    }

    // Build variants
    type SizeKey = 'XS'|'S'|'M'|'L'|'XL'|'XXL';
    let finalVariants: { size: SizeKey; stock: number }[] = [];
    if (variants && variants.length > 0) {
      finalVariants = variants as { size: SizeKey; stock: number }[];
    } else if (sizes) {
      finalVariants = Object.entries(sizes).map(([sz, stock]) => ({ size: sz as SizeKey, stock }));
    }

    // Build images
    let finalImages: { url: string; altText?: string; sortOrder: number }[] = [];
    if (Array.isArray(images)) {
      finalImages = images.map((img: any, i: number) =>
        typeof img === 'string'
          ? { url: img, sortOrder: i }
          : { url: img.url, altText: img.altText, sortOrder: img.sortOrder ?? i }
      );
    }

    const finalSlug = productData.slug
      || productData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      + '-' + Math.random().toString(36).substring(2, 7);

    // ACID transaction
    const productId = await db.transaction(async (tx) => {
      const [existing] = await tx.select({ id: products.id }).from(products).where(eq(products.slug, finalSlug)).limit(1);
      if (existing) throw new Error('SLUG_CONFLICT');

      const id = randomUUID();
      await tx.insert(products).values({
        id,
        ...productData,
        slug:         finalSlug,
        collectionId: finalCollectionId!,
      });

      if (finalVariants.length > 0) {
        await tx.insert(productSizeVariants).values(
          finalVariants.map((v) => ({ id: randomUUID(), productId: id, size: v.size, stock: v.stock }))
        );
      }

      if (finalImages.length > 0) {
        await tx.insert(productImages).values(
          finalImages.map((img) => ({
            id: randomUUID(), productId: id,
            url: img.url, altText: img.altText ?? null, sortOrder: img.sortOrder,
          }))
        );
      }

      return id;
    });

    // Fetch result for response
    const [product] = await db
      .select({
        id: products.id, title: products.title, slug: products.slug,
        description: products.description, priceINR: products.priceINR,
        compareAtPriceINR: products.compareAtPriceINR, collectionId: products.collectionId,
        isActive: products.isActive, isFeatured: products.isFeatured,
        createdAt: products.createdAt, updatedAt: products.updatedAt,
        collectionName: collections.name, collectionSlug: collections.slug,
      })
      .from(products)
      .leftJoin(collections, eq(products.collectionId, collections.id))
      .where(eq(products.id, productId))
      .limit(1);

    const [pVariants, pImages] = await Promise.all([
      db.select().from(productSizeVariants).where(eq(productSizeVariants.productId, productId)).orderBy(asc(productSizeVariants.size)),
      db.select().from(productImages).where(eq(productImages.productId, productId)).orderBy(asc(productImages.sortOrder)),
    ]);

    await invalidateTags([CacheTags.products]);
    revalidatePath('/');

    return NextResponse.json(
      {
        product: {
          ...product,
          createdAt: product.createdAt.toISOString(),
          updatedAt: product.updatedAt.toISOString(),
          category:  product.collectionName || '',
          collection: { id: product.collectionId, name: product.collectionName, slug: product.collectionSlug },
          sizes:            buildSizesMap(pVariants),
          variants:         pVariants,
          images:           pImages.map((img) => img.url),
          normalizedImages: pImages,
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    if (err?.message === 'SLUG_CONFLICT') {
      return NextResponse.json({ error: 'Slug already exists' }, { status: 409 });
    }
    if (err?.code === 'ER_DUP_ENTRY') {
      return NextResponse.json({ error: 'Slug already exists' }, { status: 409 });
    }
    if (process.env.NODE_ENV !== 'production') console.error('[POST /api/products]', err);
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 });
  }
}
