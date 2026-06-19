/**
 * GET    /api/products/[id]  — single product (public, cached)
 * PATCH  /api/products/[id]  — update product, variants, images (admin)
 * DELETE /api/products/[id]  — soft delete (admin)
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

const SINGLE_PRODUCT_TTL = 1800; // 30 min

const SizeVariantSchema = z.object({
  size: z.enum(['XS', 'S', 'M', 'L', 'XL', 'XXL']),
  stock: z.number().int().min(0),
});

const ImageSchema = z.object({
  url: z.string().url(),
  altText: z.string().optional(),
  sortOrder: z.number().int().min(0).optional().default(0),
});

const UpdateProductSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().min(1).optional(),
  priceINR: z.number().positive().optional(),
  compareAtPriceINR: z.number().positive().nullable().optional(),
  collectionId: z.string().uuid().optional(),
  category: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  variants: z.array(SizeVariantSchema).optional(),
  sizes: z.record(z.string(), z.number()).optional(),
  images: z.any().optional(),
});

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const cacheKey = CacheKeys.products.single(id);
    const cached = await cacheGet(cacheKey);
    if (cached) return NextResponse.json({ product: cached });

    const product = await db.product.findFirst({
      where: { id, deletedAt: null },
      include: {
        collection: { select: { id: true, name: true, slug: true } },
        variants: { orderBy: { size: 'asc' } },
        images: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const sizesMap: Record<string, number> = {
      XS: product.variants.find((v) => v.size === 'XS')?.stock ?? 0,
      S: product.variants.find((v) => v.size === 'S')?.stock ?? 0,
      M: product.variants.find((v) => v.size === 'M')?.stock ?? 0,
      L: product.variants.find((v) => v.size === 'L')?.stock ?? 0,
      XL: product.variants.find((v) => v.size === 'XL')?.stock ?? 0,
      XXL: product.variants.find((v) => v.size === 'XXL')?.stock ?? 0,
    };

    const serialised = {
      ...product,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
      deletedAt: product.deletedAt?.toISOString() ?? null,
      category: product.collection?.name || '',
      sizes: sizesMap,
      images: product.images.map((img) => img.url),
      normalizedImages: product.images,
    };

    await cacheSet(
      cacheKey,
      serialised,
      [CacheTags.products, CacheTags.product(id)],
      SINGLE_PRODUCT_TTL,
    );

    return NextResponse.json({ product: serialised });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[GET /api/products/[id]]', err);
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 });
  }
}

// ── PATCH ────────────────────────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body: unknown = await request.json();
    const parsed = UpdateProductSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', issues: parsed.error.issues }, { status: 400 });
    }

    const { variants, sizes, images, category, collectionId, ...scalarData } = parsed.data;

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

    // Determine variants
    let finalVariants: { size: 'XS'|'S'|'M'|'L'|'XL'|'XXL', stock: number }[] | undefined = undefined;
    if (variants && variants.length > 0) {
      finalVariants = variants;
    } else if (sizes) {
      finalVariants = Object.entries(sizes).map(([sz, stock]) => ({
        size: sz as any,
        stock,
      }));
    }

    // Determine images
    let finalImages: { url: string; altText?: string; sortOrder: number }[] | undefined = undefined;
    if (images) {
      if (Array.isArray(images)) {
        finalImages = images.map((img: any, i: number) => {
          if (typeof img === 'string') {
            return { url: img, sortOrder: i };
          }
          return { url: img.url, altText: img.altText, sortOrder: img.sortOrder ?? i };
        });
      }
    }

    const updated = await db.$transaction(async (tx) => {
      // Check exists
      const existing = await tx.product.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new Error('NOT_FOUND');

      // If new slug, check uniqueness
      if (scalarData.slug && scalarData.slug !== existing.slug) {
        const conflict = await tx.product.findFirst({ where: { slug: scalarData.slug, id: { not: id } } });
        if (conflict) throw new Error('SLUG_CONFLICT');
      }

      // Replace variants atomically if provided
      if (finalVariants !== undefined) {
        await tx.productSizeVariant.deleteMany({ where: { productId: id } });
        await tx.productSizeVariant.createMany({
          data: finalVariants.map((v) => ({ productId: id, size: v.size, stock: v.stock })),
        });
      }

      // Replace images atomically if provided
      if (finalImages !== undefined) {
        await tx.productImage.deleteMany({ where: { productId: id } });
        await tx.productImage.createMany({
          data: finalImages.map((img) => ({
            productId: id,
            url: img.url,
            altText: img.altText ?? null,
            sortOrder: img.sortOrder,
          })),
        });
      }

      return tx.product.update({
        where: { id },
        data: {
          ...scalarData,
          ...(finalCollectionId ? { collectionId: finalCollectionId } : {}),
          updatedAt: new Date(),
        },
        include: {
          collection: { select: { id: true, name: true, slug: true } },
          variants: { orderBy: { size: 'asc' } },
          images: { orderBy: { sortOrder: 'asc' } },
        },
      });
    });

    await invalidateTags([CacheTags.products, CacheTags.product(id)]);
    revalidatePath('/');

    const mappedSizes: Record<string, number> = {
      XS: updated.variants.find((v) => v.size === 'XS')?.stock ?? 0,
      S: updated.variants.find((v) => v.size === 'S')?.stock ?? 0,
      M: updated.variants.find((v) => v.size === 'M')?.stock ?? 0,
      L: updated.variants.find((v) => v.size === 'L')?.stock ?? 0,
      XL: updated.variants.find((v) => v.size === 'XL')?.stock ?? 0,
      XXL: updated.variants.find((v) => v.size === 'XXL')?.stock ?? 0,
    };

    return NextResponse.json({
      product: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        deletedAt: updated.deletedAt?.toISOString() ?? null,
        category: updated.collection?.name || '',
        sizes: mappedSizes,
        images: updated.images.map((img) => img.url),
        normalizedImages: updated.images,
      },
    });
  } catch (err: any) {
    if (err?.message === 'NOT_FOUND') return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    if (err?.message === 'SLUG_CONFLICT') return NextResponse.json({ error: 'Slug already in use' }, { status: 409 });
    if (process.env.NODE_ENV !== 'production') console.error('[PATCH /api/products/[id]]', err);
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
  }
}

// ── DELETE (soft) ─────────────────────────────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const existing = await db.product.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Soft delete — preserves order history references
    await db.product.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await invalidateTags([CacheTags.products, CacheTags.product(id)]);
    revalidatePath('/');

    return NextResponse.json({ success: true, message: 'Product deactivated and soft-deleted' });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[DELETE /api/products/[id]]', err);
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 });
  }
}
