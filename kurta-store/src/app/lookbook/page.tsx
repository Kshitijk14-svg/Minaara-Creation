import type { Metadata } from 'next';
import LookbookClient from './LookbookClient';
import type { Product, DesignConfig } from '@/types/schema';

export const revalidate = 600;

export const metadata: Metadata = {
  title: 'Lookbook | Minaara Creation',
  description: 'Discover our curated lookbook — artisanal Indian womenswear styled for the modern woman.',
};

async function getData(): Promise<{ products: Product[]; config: DesignConfig | null }> {
  if (process.env.DATABASE_URL?.includes('password@localhost')) {
    return { products: [], config: null };
  }

  try {
    const { db }  = await import('@/db/index');
    const { products, collections, productSizeVariants, productImages, designConfigs } = await import('@/db/schema');
    const { and, asc, desc, eq, inArray, isNull } = await import('drizzle-orm');

    const [configRow, productRows] = await Promise.all([
      db.select().from(designConfigs).where(eq(designConfigs.id, 'current_config')).limit(1),
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
        .where(and(eq(products.isFeatured, true), eq(products.isActive, true), isNull(products.deletedAt)))
        .orderBy(desc(products.createdAt))
        .limit(9),
    ]);

    const ids = productRows.map((r) => r.id);
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

    const formattedProducts: Product[] = productRows.map((p) => {
      const variants = varMap.get(p.id) ?? [];
      const images   = imgMap.get(p.id)  ?? [];
      const sizes: Record<string, number> = { XS: 0, S: 0, M: 0, L: 0, XL: 0, XXL: 0 };
      for (const v of variants) sizes[v.size] = v.stock;
      return {
        ...p,
        compareAtPriceINR: p.compareAtPriceINR ?? undefined,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        deletedAt: p.deletedAt?.toISOString() ?? null,
        newArrivalUntil: p.newArrivalUntil?.toISOString() ?? null,
        category: p.collectionName || '',
        collection: { id: p.collectionId, name: p.collectionName ?? '', slug: p.collectionSlug ?? '' },
        variants,
        sizes: sizes as any,
        images: images.map((img) => img.url),
        normalizedImages: images.map((img) => ({ ...img, altText: img.altText ?? undefined })),
      };
    });

    const config = configRow[0];
    const formattedConfig: DesignConfig | null = config ? {
      id: config.id,
      heroBanners: config.heroBanners as DesignConfig['heroBanners'],
      isLookbookActive: config.isLookbookActive,
      activeTheme: config.activeTheme,
      promoBannerText: config.promoBannerText ?? undefined,
      updatedAt: config.updatedAt.toISOString(),
    } : null;

    return { products: formattedProducts, config: formattedConfig };
  } catch (e) {
    console.warn('[lookbook] DB error:', (e as Error).message);
    return { products: [], config: null };
  }
}

export default async function LookbookPage() {
  const { products, config } = await getData();
  return <LookbookClient products={products} config={config} />;
}
