import React from 'react';
import type { Product, DesignConfig } from '@/types/schema';
import CollectionClient from './CollectionClient';

export const revalidate = 600; // Next.js ISR revalidation every 10 mins

async function getProducts(): Promise<Product[]> {
  if (
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.UPSTASH_REDIS_REST_URL?.includes('your-upstash-url') ||
    process.env.DATABASE_URL?.includes('password@localhost')
  ) {
    return [];
  }

  const CACHE_KEY = 'products_list:all:all:100:0'; // Fetch up to 100 active/inactive products for the collection view
  
  // Try Redis first
  try {
    const { redis } = await import('@/lib/redis');
    const cached = await redis.get<{ products: Product[]; total: number }>(CACHE_KEY);
    if (cached && cached.products) return cached.products;
  } catch (e) {
    console.error('Redis cache error in collection page:', e);
  }

  // Helper to fail fast if DB is down
  const withTimeout = <T,>(promise: Promise<T>, ms = 1500) => {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('DB Timeout')), ms))
    ]);
  };

  let products: any[] = [];
  try {
    const { db } = await import('@/lib/db');
    products = await withTimeout(db.product.findMany({
      where: { isActive: true, deletedAt: null },
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
      take: 100,
    }));
  } catch (e) {
    console.warn('Prisma DB error in collection page (fallback to empty):', (e as Error).message);
  }

  const formatted = products.map(p => {
    const sizes: Record<string, number> = {
      XS: p.variants.find((v: any) => v.size === 'XS')?.stock ?? 0,
      S: p.variants.find((v: any) => v.size === 'S')?.stock ?? 0,
      M: p.variants.find((v: any) => v.size === 'M')?.stock ?? 0,
      L: p.variants.find((v: any) => v.size === 'L')?.stock ?? 0,
      XL: p.variants.find((v: any) => v.size === 'XL')?.stock ?? 0,
      XXL: p.variants.find((v: any) => v.size === 'XXL')?.stock ?? 0,
    };
    return {
      ...p,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      deletedAt: p.deletedAt?.toISOString() ?? null,
      category: p.collection?.name || '',
      sizes,
      images: p.images.map((img: any) => img.url),
      normalizedImages: p.images,
    };
  });

  // Cache in background
  if (formatted.length > 0) {
    try {
      const { redis } = await import('@/lib/redis');
      await redis.set(CACHE_KEY, { products: formatted, total: products.length }, { ex: 600 });
    } catch (e) {}
  }

  return formatted;
}

export default async function CollectionPage() {
  const products = await getProducts();
  return <CollectionClient initialProducts={products} />;
}
