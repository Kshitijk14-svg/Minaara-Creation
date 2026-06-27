import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CollectionDetailClient from './CollectionDetailClient';
import type { Product, Collection } from '@/types/schema';

export const revalidate = 600;

async function getData(slug: string): Promise<{ collection: Collection; products: Product[] } | null> {
  if (process.env.DATABASE_URL?.includes('password@localhost')) return null;

  try {
    const { db } = await import('@/db/index');
    const { products, collections, productSizeVariants, productImages } = await import('@/db/schema');
    const { and, asc, desc, eq, inArray, isNull } = await import('drizzle-orm');

    const [collRow] = await db.select().from(collections).where(eq(collections.slug, slug)).limit(1);
    if (!collRow || !collRow.isActive) return null;

    const productRows = await db.select({
      id: products.id, title: products.title, slug: products.slug,
      description: products.description, priceINR: products.priceINR,
      compareAtPriceINR: products.compareAtPriceINR, collectionId: products.collectionId,
      isActive: products.isActive, isFeatured: products.isFeatured,
      createdAt: products.createdAt, updatedAt: products.updatedAt, deletedAt: products.deletedAt,
    })
      .from(products)
      .where(and(eq(products.collectionId, collRow.id), eq(products.isActive, true), isNull(products.deletedAt)))
      .orderBy(desc(products.createdAt))
      .limit(100);

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
        category: collRow.name,
        collection: { id: collRow.id, name: collRow.name, slug: collRow.slug },
        variants,
        sizes: sizes as any,
        images: images.map((img) => img.url),
        normalizedImages: images.map((img) => ({ ...img, altText: img.altText ?? undefined })),
      };
    });

    return {
      collection: {
        id: collRow.id, name: collRow.name, slug: collRow.slug,
        description: collRow.description ?? undefined,
        imageUrl: collRow.imageUrl ?? undefined,
        isActive: collRow.isActive, sortOrder: collRow.sortOrder,
        createdAt: collRow.createdAt.toISOString(),
        updatedAt: collRow.updatedAt.toISOString(),
      },
      products: formattedProducts,
    };
  } catch (e) {
    console.warn('[collection/[slug]] DB error:', (e as Error).message);
    return null;
  }
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const data = await getData(slug);
  if (!data) return { title: 'Collection Not Found | Minaara Creation' };
  return {
    title: `${data.collection.name} | Minaara Creation`,
    description: data.collection.description ?? `Shop ${data.collection.name} — premium Indian womenswear by Minaara Creation.`,
    openGraph: {
      title: data.collection.name,
      images: data.collection.imageUrl ? [{ url: data.collection.imageUrl }] : [],
    },
  };
}

export default async function CollectionDetailPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const data = await getData(slug);
  if (!data) notFound();
  return <CollectionDetailClient collection={data.collection} products={data.products} />;
}
