import type { Product, DesignConfig, Collection, Testimonial } from '@/types/schema';
import HomeClient from './HomeClient';
import { StorefrontKeys } from '@/lib/cache';

export const revalidate = 600;

const withTimeout = <T,>(promise: Promise<T>, ms = 1500): Promise<T> =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('DB Timeout')), ms)),
  ]);

async function getProducts(): Promise<Product[]> {
  if (
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.DATABASE_URL?.includes('password@localhost')
  ) {
    return [];
  }

  const CACHE_KEY = 'products_list:all:true:20:0';

  try {
    const { redis } = await import('@/lib/redis');
    const cached = await redis.get<{ products: Product[] }>(CACHE_KEY);
    if (cached?.products) return cached.products;
  } catch {}

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
        .limit(20)
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
    console.warn('DB error in home page (fallback to empty):', (e as Error).message);
    return [];
  }
}

async function getFlaggedProducts(kind: 'new-arrivals' | 'bestsellers' | 'featured'): Promise<Product[]> {
  if (
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.DATABASE_URL?.includes('password@localhost')
  ) {
    return [];
  }

  const CACHE_KEY = kind === 'new-arrivals'
    ? StorefrontKeys.homeNewArrivals
    : kind === 'bestsellers'
    ? StorefrontKeys.homeBestsellers
    : StorefrontKeys.homeFeatured;

  try {
    const { redis } = await import('@/lib/redis');
    const cached = await redis.get<{ products: Product[] }>(CACHE_KEY);
    if (cached?.products) return cached.products;
  } catch {}

  try {
    const { db } = await import('@/db/index');
    const { products, collections, productSizeVariants, productImages } = await import('@/db/schema');
    const { and, asc, desc, eq, gt, inArray, isNull, or } = await import('drizzle-orm');

    const flagCondition = kind === 'bestsellers'
      ? eq(products.isBestseller, true)
      : kind === 'featured'
      ? eq(products.isFeatured, true)
      : and(eq(products.isNewArrival, true), or(isNull(products.newArrivalUntil), gt(products.newArrivalUntil, new Date())));

    const rows = await withTimeout(
      db.select({
        id: products.id, title: products.title, slug: products.slug,
        description: products.description, priceINR: products.priceINR,
        compareAtPriceINR: products.compareAtPriceINR, collectionId: products.collectionId,
        isActive: products.isActive, isFeatured: products.isFeatured,
        isBestseller: products.isBestseller, isNewArrival: products.isNewArrival,
        newArrivalUntil: products.newArrivalUntil,
        createdAt: products.createdAt, updatedAt: products.updatedAt, deletedAt: products.deletedAt,
        collectionName: collections.name, collectionSlug: collections.slug,
      })
        .from(products)
        .leftJoin(collections, eq(products.collectionId, collections.id))
        .where(and(eq(products.isActive, true), isNull(products.deletedAt), flagCondition))
        .orderBy(desc(products.createdAt))
        .limit(8)
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
        newArrivalUntil: p.newArrivalUntil?.toISOString() ?? null,
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
    console.warn(`DB error fetching ${kind} (fallback to empty):`, (e as Error).message);
    return [];
  }
}

async function getHomeCollections(): Promise<Collection[]> {
  if (
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.DATABASE_URL?.includes('password@localhost')
  ) {
    return [];
  }

  const CACHE_KEY = StorefrontKeys.homeCollections;

  try {
    const { redis } = await import('@/lib/redis');
    const cached = await redis.get<{ collections: Collection[] }>(CACHE_KEY);
    if (cached?.collections) return cached.collections;
  } catch {}

  try {
    const { db } = await import('@/db/index');
    const { collections } = await import('@/db/schema');
    const { asc, eq } = await import('drizzle-orm');

    const rows = await withTimeout(
      db.select({
        id: collections.id, name: collections.name, slug: collections.slug,
        description: collections.description, imageUrl: collections.imageUrl,
        isActive: collections.isActive, sortOrder: collections.sortOrder,
        createdAt: collections.createdAt, updatedAt: collections.updatedAt,
      })
        .from(collections)
        .where(eq(collections.isActive, true))
        .orderBy(asc(collections.sortOrder), asc(collections.name))
        .limit(8)
    );

    const formatted: Collection[] = rows.map((c) => ({
      ...c,
      description: c.description ?? undefined,
      imageUrl:    c.imageUrl ?? undefined,
      createdAt:   c.createdAt.toISOString(),
      updatedAt:   c.updatedAt.toISOString(),
    }));

    if (formatted.length > 0) {
      const { redis } = await import('@/lib/redis');
      await redis.set(CACHE_KEY, { collections: formatted }, { ex: 600 }).catch(() => {});
    }

    return formatted;
  } catch (e) {
    console.warn('DB error fetching home collections (fallback to empty):', (e as Error).message);
    return [];
  }
}

async function getDesignConfig(): Promise<DesignConfig | null> {
  if (
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.DATABASE_URL?.includes('password@localhost')
  ) {
    return null;
  }

  const CACHE_KEY = 'design_config';

  try {
    const { redis } = await import('@/lib/redis');
    const cached = await redis.get<DesignConfig>(CACHE_KEY);
    if (cached) return cached;
  } catch {}

  try {
    const { db } = await import('@/db/index');
    const { designConfigs } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');

    const [config] = await withTimeout(
      db.select().from(designConfigs).where(eq(designConfigs.id, 'current_config')).limit(1)
    );

    if (config) {
      const formatted: DesignConfig = {
        id:               config.id,
        heroBanners:      config.heroBanners as unknown as DesignConfig['heroBanners'],
        isLookbookActive: config.isLookbookActive,
        activeTheme:      config.activeTheme,
        promoBannerText:  config.promoBannerText ?? undefined,
        heroContent:      (config.heroContent as unknown as DesignConfig['heroContent']) ?? undefined,
        uspItems:         (config.uspItems as unknown as DesignConfig['uspItems']) ?? undefined,
        marqueeWords:     (config.marqueeWords as unknown as DesignConfig['marqueeWords']) ?? undefined,
        aboutPanels:      (config.aboutPanels as unknown as DesignConfig['aboutPanels']) ?? undefined,
        editorialStories: (config.editorialStories as unknown as DesignConfig['editorialStories']) ?? undefined,
        stats:            (config.stats as unknown as DesignConfig['stats']) ?? undefined,
        footerContent:    (config.footerContent as unknown as DesignConfig['footerContent']) ?? undefined,
        updatedAt:        config.updatedAt.toISOString(),
      };
      const { redis } = await import('@/lib/redis');
      await redis.set(CACHE_KEY, formatted, { ex: 3600 }).catch(() => {});
      return formatted;
    }
  } catch (e) {
    console.warn('DB error for DesignConfig (fallback to null):', (e as Error).message);
  }

  return null;
}

async function getHomeTestimonials(): Promise<Testimonial[]> {
  if (
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.DATABASE_URL?.includes('password@localhost')
  ) {
    return [];
  }

  const CACHE_KEY = StorefrontKeys.homeTestimonials;

  try {
    const { redis } = await import('@/lib/redis');
    const cached = await redis.get<{ testimonials: Testimonial[] }>(CACHE_KEY);
    if (cached?.testimonials) return cached.testimonials;
  } catch {}

  try {
    const { db } = await import('@/db/index');
    const { testimonials } = await import('@/db/schema');
    const { asc, eq } = await import('drizzle-orm');

    const rows = await withTimeout(
      db.select().from(testimonials)
        .where(eq(testimonials.isActive, true))
        .orderBy(asc(testimonials.sortOrder), asc(testimonials.createdAt))
    );

    const formatted: Testimonial[] = rows.map((t) => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }));

    if (formatted.length > 0) {
      const { redis } = await import('@/lib/redis');
      await redis.set(CACHE_KEY, { testimonials: formatted }, { ex: 600 }).catch(() => {});
    }

    return formatted;
  } catch (e) {
    console.warn('DB error fetching testimonials (fallback to empty):', (e as Error).message);
    return [];
  }
}

export default async function Page() {
  const [products, designConfig, newArrivals, bestsellers, featured, collections, testimonials] = await Promise.all([
    getProducts(),
    getDesignConfig(),
    getFlaggedProducts('new-arrivals'),
    getFlaggedProducts('bestsellers'),
    getFlaggedProducts('featured'),
    getHomeCollections(),
    getHomeTestimonials(),
  ]);
  return (
    <HomeClient
      initialProducts={products}
      initialDesignConfig={designConfig}
      newArrivals={newArrivals}
      bestsellers={bestsellers}
      featured={featured}
      collections={collections}
      testimonials={testimonials}
    />
  );
}
