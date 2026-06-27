import React from 'react';
import type { Product } from '@/types/schema';
import CollectionClient from './CollectionClient';

export const revalidate = 600;

async function getProducts(): Promise<Product[]> {
  if (
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.UPSTASH_REDIS_REST_URL?.includes('your-upstash-url') ||
    process.env.DATABASE_URL?.includes('password@localhost')
  ) {
    return [];
  }

  const CACHE_KEY = 'products_list:all:all:100:0';

  try {
    const { redis } = await import('@/lib/redis');
    const cached = await redis.get<{ products: Product[] }>(CACHE_KEY);
    if (cached?.products) return cached.products;
  } catch {}

  const withTimeout = <T,>(p: Promise<T>, ms = 1500): Promise<T> =>
    Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('DB Timeout')), ms))]);

  try {
    const { db } = await import('@/db/index');
    const { products, collections, productSizeVariants, productImages } = await import('@/db/schema');
    const { and, asc, desc, eq, inArray, isNull } = await import('drizzle-orm');

    const rows = await withTimeout(
      db.select({
        id: products.id, title: products.title, slug: products.slug,
        description: products.description, priceINR: products.priceINR,
        compareAtPriceINR: products.compareAtPriceINR, collectionId: products.collectionId,
        isActive: products.isActive, isFeatured: products.isFeatured,
        createdAt: products.createdAt, updatedAt: products.updatedAt, deletedAt: products.deletedAt,
        collectionName: collections.name, collectionSlug: collections.slug,
      })
        .from(products)
        .leftJoin(collections, eq(products.collectionId, collections.id))
        .where(and(eq(products.isActive, true), isNull(products.deletedAt)))
        .orderBy(desc(products.createdAt))
        .limit(100)
    );

    const ids = rows.map((r) => r.id);
    const [varRows, imgRows] = ids.length > 0
      ? await Promise.all([
          db.select({ productId: productSizeVariants.productId, id: productSizeVariants.id, size: productSizeVariants.size, stock: productSizeVariants.stock })
            .from(productSizeVariants).where(inArray(productSizeVariants.productId, ids)).orderBy(asc(productSizeVariants.size)),
          db.select({ productId: productImages.productId, id: productImages.id, url: productImages.url, altText: productImages.altText, sortOrder: productImages.sortOrder })
            .from(productImages).where(inArray(productImages.productId, ids)).orderBy(asc(productImages.sortOrder)),
        ])
      : [[], []];

    const varMap = new Map<string, typeof varRows>();
    const imgMap = new Map<string, typeof imgRows>();
    for (const v of varRows) { if (!varMap.has(v.productId)) varMap.set(v.productId, []); varMap.get(v.productId)!.push(v); }
    for (const img of imgRows) { if (!imgMap.has(img.productId)) imgMap.set(img.productId, []); imgMap.get(img.productId)!.push(img); }

    const formatted: Product[] = rows.map((p) => {
      const variants = varMap.get(p.id) ?? [];
      const images   = imgMap.get(p.id)  ?? [];
      const sizes: Record<string, number> = { XS: 0, S: 0, M: 0, L: 0, XL: 0, XXL: 0 };
      for (const v of variants) sizes[v.size] = v.stock;
      return {
        ...p,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        deletedAt: p.deletedAt?.toISOString() ?? null,
        category:  p.collectionName || '',
        collection: { id: p.collectionId, name: p.collectionName ?? '', slug: p.collectionSlug ?? '' },
        variants,
        sizes,
        images:           images.map((img) => img.url),
        normalizedImages: images,
      } as any;
    });

    if (formatted.length > 0) {
      const { redis } = await import('@/lib/redis');
      await redis.set(CACHE_KEY, { products: formatted, total: formatted.length }, { ex: 600 }).catch(() => {});
    }

    return formatted;
  } catch (e) {
    console.warn('DB error in collection page (fallback to empty):', (e as Error).message);
    return [];
  }
}

export default async function CollectionPage() {
  const products = await getProducts();
  return <CollectionClient initialProducts={products} />;
}
