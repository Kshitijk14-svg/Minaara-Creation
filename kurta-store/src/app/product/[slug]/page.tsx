import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ProductDetailClient from './ProductDetailClient';
import type { Product } from '@/types/schema';

export const revalidate = 1800;

async function getProductBySlug(slug: string): Promise<Product | null> {
  if (
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.DATABASE_URL?.includes('password@localhost')
  ) return null;

  try {
    const { db } = await import('@/db/index');
    const { products, collections, productSizeVariants, productImages } = await import('@/db/schema');
    const { and, asc, eq, inArray, isNull } = await import('drizzle-orm');

    const [row] = await db
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
      .where(and(eq(products.slug, slug), eq(products.isActive, true), isNull(products.deletedAt)))
      .limit(1);

    if (!row) return null;

    const [varRows, imgRows] = await Promise.all([
      db.select({ id: productSizeVariants.id, productId: productSizeVariants.productId, size: productSizeVariants.size, stock: productSizeVariants.stock })
        .from(productSizeVariants)
        .where(eq(productSizeVariants.productId, row.id))
        .orderBy(asc(productSizeVariants.size)),
      db.select({ id: productImages.id, productId: productImages.productId, url: productImages.url, altText: productImages.altText, sortOrder: productImages.sortOrder })
        .from(productImages)
        .where(eq(productImages.productId, row.id))
        .orderBy(asc(productImages.sortOrder)),
    ]);

    const sizes: Record<string, number> = { XS: 0, S: 0, M: 0, L: 0, XL: 0, XXL: 0 };
    for (const v of varRows) sizes[v.size] = v.stock;

    return {
      ...row,
      compareAtPriceINR: row.compareAtPriceINR ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      deletedAt: row.deletedAt?.toISOString() ?? null,
      newArrivalUntil: row.newArrivalUntil?.toISOString() ?? null,
      category: row.collectionName || '',
      collection: { id: row.collectionId, name: row.collectionName ?? '', slug: row.collectionSlug ?? '' },
      variants: varRows,
      sizes: sizes as any,
      images: imgRows.map((img) => img.url),
      normalizedImages: imgRows.map((img) => ({ ...img, altText: img.altText ?? undefined })),
    };
  } catch {
    return null;
  }
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: 'Product Not Found | Minaara Creation' };

  return {
    title: `${product.title} | Minaara Creation`,
    description: product.description,
    openGraph: {
      title: product.title,
      description: product.description,
      images: product.images[0] ? [{ url: product.images[0] }] : [],
      type: 'website',
    },
  };
}

export default async function ProductDetailPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.description,
    image: product.images,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'INR',
      price: product.priceINR,
      availability: Object.values(product.sizes).some((s) => s > 0)
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ProductDetailClient product={product} />
    </>
  );
}
