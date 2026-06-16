import { db } from '@/lib/db';
import { redis } from '@/lib/redis';
import type { Product, DesignConfig } from '@/types/schema';
import HomeClient from './HomeClient';

export const revalidate = 600; // Next.js ISR revalidation every 10 mins

async function getProducts(): Promise<Product[]> {
  const CACHE_KEY = 'products_list:all:true:20:0';
  
  // Try Redis first
  try {
    const cached = await redis.get<{ products: Product[]; total: number }>(CACHE_KEY);
    if (cached && cached.products) return cached.products;
  } catch (e) {
    console.error('Redis cache error:', e);
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
    products = await withTimeout(db.product.findMany({
      where: { isActive: true },
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
      take: 20,
    }));
  } catch (e) {
    console.warn('Prisma DB error (fallback to mock):', (e as Error).message);
  }

  const formatted = products.map(p => ({
    ...p,
    images: p.images as string[],
    sizes: p.sizes as Product['sizes'],
    createdAt: p.createdAt.toISOString()
  }));

  // Cache in background
  if (formatted.length > 0) {
    try {
      await redis.set(CACHE_KEY, { products: formatted, total: products.length }, { ex: 600 });
    } catch (e) {}
  }

  return formatted;
}

async function getDesignConfig(): Promise<DesignConfig | null> {
  const CACHE_KEY = 'design_config_active';
  try {
    const cached = await redis.get<DesignConfig>(CACHE_KEY);
    if (cached) return cached;
  } catch (e) {}

  const withTimeout = <T,>(promise: Promise<T>, ms = 1500) => {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('DB Timeout')), ms))
    ]);
  };

  let config = null;
  try {
    config = await withTimeout(db.designConfig.findFirst({
      where: { id: 'current_config' }
    }));
  } catch (e) {
    console.warn('Prisma DB error for DesignConfig (fallback to null):', (e as Error).message);
  }

  if (config) {
    const formatted: DesignConfig = {
      id: config.id,
      heroBanners: config.heroBanners as unknown as DesignConfig['heroBanners'],
      isLookbookActive: config.isLookbookActive,
      activeTheme: config.activeTheme,
      promoBannerText: config.promoBannerText ?? undefined,
      updatedAt: config.updatedAt.toISOString(),
    };
    try {
      await redis.set(CACHE_KEY, formatted, { ex: 3600 });
    } catch (e) {}
    return formatted;
  }
  return null;
}

export default async function Page() {
  // Fetch data natively on the server (SEO optimized!)
  const [products, designConfig] = await Promise.all([
    getProducts(),
    getDesignConfig()
  ]);

  return <HomeClient initialProducts={products} initialDesignConfig={designConfig} />;
}
