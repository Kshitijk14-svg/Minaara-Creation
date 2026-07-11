/**
 * GET    /api/products/[id]  — single product (public, cached)
 * PATCH  /api/products/[id]  — update product, variants, images (admin)
 * DELETE /api/products/[id]  — soft delete (admin)
 */
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db/index';
import { products, collections, productSizeVariants, productImages } from '@/db/schema';
import { isAuthorized } from '@/lib/api-auth';
import {
  cacheGet, cacheSet, invalidateTags, invalidateStorefrontProducts,
  CacheKeys, CacheTags,
} from '@/lib/cache';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'crypto';

const SINGLE_PRODUCT_TTL = 1800;

const SizeVariantSchema = z.object({
  size:  z.enum(['XS', 'S', 'M', 'L', 'XL', 'XXL']),
  stock: z.number().int().min(0),
});

const UpdateProductSchema = z.object({
  title:             z.string().min(1).max(255).optional(),
  slug:              z.string().min(1).max(255).regex(/^[a-z0-9-]+$/).optional(),
  description:       z.string().min(1).optional(),
  priceINR:          z.number().positive().optional(),
  compareAtPriceINR: z.number().positive().nullable().optional(),
  collectionId:      z.string().uuid().optional(),
  category:          z.string().min(1).optional(),
  isActive:          z.boolean().optional(),
  isFeatured:        z.boolean().optional(),
  isBestseller:      z.boolean().optional(),
  isNewArrival:      z.boolean().optional(),
  newArrivalUntil:   z.string().datetime().nullable().optional(),
  variants:          z.array(SizeVariantSchema).optional(),
  sizes:             z.record(z.string(), z.number()).optional(),
  images:            z.any().optional(),
  reelVideoUrl:       z.string().max(500).nullable().optional(),
  reelVideoPosterUrl: z.string().max(500).nullable().optional(),
});

function buildSizesMap(variants: Array<{ size: string; stock: number }>) {
  const map: Record<string, number> = { XS: 0, S: 0, M: 0, L: 0, XL: 0, XXL: 0 };
  for (const v of variants) map[v.size] = v.stock;
  return map;
}

async function fetchFullProduct(id: string) {
  const [p] = await db
    .select({
      id: products.id, title: products.title, slug: products.slug,
      description: products.description, priceINR: products.priceINR,
      compareAtPriceINR: products.compareAtPriceINR, collectionId: products.collectionId,
      isActive: products.isActive, isFeatured: products.isFeatured,
      isBestseller: products.isBestseller, isNewArrival: products.isNewArrival,
      newArrivalUntil: products.newArrivalUntil,
      reelVideoUrl: products.reelVideoUrl, reelVideoPosterUrl: products.reelVideoPosterUrl,
      createdAt: products.createdAt, updatedAt: products.updatedAt, deletedAt: products.deletedAt,
      collectionName: collections.name, collectionSlug: collections.slug,
    })
    .from(products)
    .leftJoin(collections, eq(products.collectionId, collections.id))
    .where(and(eq(products.id, id), isNull(products.deletedAt)))
    .limit(1);

  if (!p) return null;

  const [pVariants, pImages] = await Promise.all([
    db.select().from(productSizeVariants).where(eq(productSizeVariants.productId, id)).orderBy(asc(productSizeVariants.size)),
    db.select().from(productImages).where(eq(productImages.productId, id)).orderBy(asc(productImages.sortOrder)),
  ]);

  return {
    ...p,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    deletedAt: p.deletedAt?.toISOString() ?? null,
    newArrivalUntil: p.newArrivalUntil?.toISOString() ?? null,
    category:  p.collectionName || '',
    collection: { id: p.collectionId, name: p.collectionName, slug: p.collectionSlug },
    sizes:            buildSizesMap(pVariants),
    variants:         pVariants,
    images:           pImages.map((img) => img.url),
    normalizedImages: pImages,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const cacheKey = CacheKeys.products.single(id);
    const cached   = await cacheGet(cacheKey);
    if (cached) return NextResponse.json({ product: cached });

    const product = await fetchFullProduct(id);
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

    await cacheSet(cacheKey, product, [CacheTags.products, CacheTags.product(id)], SINGLE_PRODUCT_TTL);
    return NextResponse.json({ product });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[GET /api/products/[id]]', err);
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body   = await request.json();
    const parsed = UpdateProductSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', issues: parsed.error.issues }, { status: 400 });
    }

    const { variants, sizes, images, category, collectionId, newArrivalUntil, ...scalarData } = parsed.data;
    const finalNewArrivalUntil = newArrivalUntil !== undefined
      ? (newArrivalUntil ? new Date(newArrivalUntil) : null)
      : undefined;

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

    type SizeKey = 'XS'|'S'|'M'|'L'|'XL'|'XXL';
    let finalVariants: { size: SizeKey; stock: number }[] | undefined;
    if (variants && variants.length > 0) {
      finalVariants = variants as { size: SizeKey; stock: number }[];
    } else if (sizes) {
      finalVariants = Object.entries(sizes).map(([sz, stock]) => ({ size: sz as SizeKey, stock }));
    }

    let finalImages: { url: string; altText?: string; sortOrder: number }[] | undefined;
    if (images && Array.isArray(images)) {
      finalImages = images.map((img: any, i: number) =>
        typeof img === 'string'
          ? { url: img, sortOrder: i }
          : { url: img.url, altText: img.altText, sortOrder: img.sortOrder ?? i }
      );
    }

    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: products.id, slug: products.slug })
        .from(products)
        .where(and(eq(products.id, id), isNull(products.deletedAt)))
        .limit(1);

      if (!existing) throw new Error('NOT_FOUND');

      if (scalarData.slug && scalarData.slug !== existing.slug) {
        const [conflict] = await tx
          .select({ id: products.id })
          .from(products)
          .where(and(eq(products.slug, scalarData.slug)))
          .limit(1);
        if (conflict && conflict.id !== id) throw new Error('SLUG_CONFLICT');
      }

      if (finalVariants !== undefined) {
        await tx.delete(productSizeVariants).where(eq(productSizeVariants.productId, id));
        if (finalVariants.length > 0) {
          await tx.insert(productSizeVariants).values(
            finalVariants.map((v) => ({ id: randomUUID(), productId: id, size: v.size, stock: v.stock }))
          );
        }
      }

      if (finalImages !== undefined) {
        await tx.delete(productImages).where(eq(productImages.productId, id));
        if (finalImages.length > 0) {
          await tx.insert(productImages).values(
            finalImages.map((img) => ({
              id: randomUUID(), productId: id,
              url: img.url, altText: img.altText ?? null, sortOrder: img.sortOrder,
            }))
          );
        }
      }

      await tx.update(products).set({
        ...scalarData,
        ...(finalCollectionId ? { collectionId: finalCollectionId } : {}),
        ...(finalNewArrivalUntil !== undefined ? { newArrivalUntil: finalNewArrivalUntil } : {}),
        ...(scalarData.reelVideoUrl !== undefined ? { reelVideoUpdatedAt: scalarData.reelVideoUrl ? new Date() : null } : {}),
        updatedAt: new Date(),
      }).where(eq(products.id, id));
    });

    const product = await fetchFullProduct(id);

    await invalidateTags([CacheTags.products, CacheTags.product(id)]);
    await invalidateStorefrontProducts();
    revalidatePath('/');
    revalidatePath('/collection');
    if ((product as any)?.slug) revalidatePath(`/product/${(product as any).slug}`);

    return NextResponse.json({ product });
  } catch (err: any) {
    if (err?.message === 'NOT_FOUND')     return NextResponse.json({ error: 'Product not found' },   { status: 404 });
    if (err?.message === 'SLUG_CONFLICT') return NextResponse.json({ error: 'Slug already in use' }, { status: 409 });
    if (process.env.NODE_ENV !== 'production') console.error('[PATCH /api/products/[id]]', err);
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const [existing] = await db
      .select({ id: products.id, slug: products.slug })
      .from(products)
      .where(and(eq(products.id, id), isNull(products.deletedAt)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    await db.update(products)
      .set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() })
      .where(eq(products.id, id));

    await invalidateTags([CacheTags.products, CacheTags.product(id)]);
    await invalidateStorefrontProducts();
    revalidatePath('/');
    revalidatePath('/collection');
    if (existing.slug) revalidatePath(`/product/${existing.slug}`);

    return NextResponse.json({ success: true, message: 'Product deactivated and soft-deleted' });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[DELETE /api/products/[id]]', err);
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 });
  }
}
