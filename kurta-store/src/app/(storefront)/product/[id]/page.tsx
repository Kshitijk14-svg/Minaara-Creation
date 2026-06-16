import React from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import type { Product } from '@/types/schema';
import { ProductDetailClient } from './ProductDetailClient';

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getProduct(id: string): Promise<Product | null> {
  try {
    const product = await db.product.findUnique({
      where: { id, isActive: true },
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
    });

    if (!product) return null;

    return {
      id: product.id,
      title: product.title,
      description: product.description,
      priceINR: product.priceINR,
      images: product.images as string[],
      sizes: product.sizes as Product['sizes'],
      category: product.category,
      isActive: product.isActive,
      createdAt: product.createdAt.toISOString(),
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) return { title: 'Product Not Found' };
  return {
    title: product.title,
    description: product.description.slice(0, 155),
    openGraph: {
      title: product.title,
      description: product.description.slice(0, 155),
      images: product.images[0] ? [{ url: product.images[0] }] : [],
    },
  };
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { id } = await params;
  const product = await getProduct(id);

  if (!product) {
    notFound();
  }

  return <ProductDetailClient product={product} />;
}
