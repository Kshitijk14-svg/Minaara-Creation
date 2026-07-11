'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useWishlist } from '@/components/providers/WishlistProvider';
import { useCart } from '@/components/providers/CartProvider';
import { useCurrency } from '@/components/providers/CurrencyProvider';
import { localResize } from '@/lib/media';
import type { Product, SizeLabel } from '@/types/schema';

const SIZE_ORDER: SizeLabel[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

export default function WishlistPage() {
  const { items, remove } = useWishlist();
  const { addItem } = useCart();
  const { currency, convertPrice } = useCurrency();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [productCache, setProductCache] = useState<Record<string, Product>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  const fmt = (priceINR: number) => {
    const c = convertPrice(priceINR);
    const sym: Record<string, string> = { INR: '₹', USD: '$', EUR: '€' };
    return `${sym[currency] ?? ''}${c.toFixed(currency === 'INR' ? 0 : 2)}`;
  };

  async function handleAddToBagClick(productId: string) {
    setErrorId(null);
    if (expandedId === productId) { setExpandedId(null); return; }
    if (productCache[productId]) { setExpandedId(productId); return; }
    setLoadingId(productId);
    try {
      const res = await fetch(`/api/products/${productId}`);
      if (!res.ok) throw new Error();
      const { product } = await res.json();
      setProductCache((c) => ({ ...c, [productId]: product }));
      setExpandedId(productId);
    } catch {
      setErrorId(productId);
    } finally {
      setLoadingId(null);
    }
  }

  function handlePickSize(product: Product, size: SizeLabel) {
    const variantId = product.variants.find((v) => v.size === size)?.id;
    if (!variantId) return;
    addItem({
      productId: product.id,
      variantId,
      title: product.title,
      size,
      imageUrl: product.images[0] ?? '',
      quantity: 1,
      priceINR: product.priceINR,
    });
    remove(product.id);
    setExpandedId(null);
    setAddedId(product.id);
    setTimeout(() => setAddedId(null), 2200);
  }

  return (
    <main style={{ backgroundColor: '#FAF8F5', minHeight: '100vh', paddingTop: '40px', paddingBottom: '80px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 48px' }}>

        <div style={{ marginBottom: '32px' }}>
          <Link
            href="/"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '12px', color: 'var(--color-brand-charcoal)', opacity: 0.6, fontFamily: 'var(--font-body)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 600 }}
          >
            <span style={{ width: '16px', height: '1px', backgroundColor: 'var(--color-brand-charcoal)', opacity: 0.3 }} />
            Back to store
          </Link>
        </div>

        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 4vw, 3.5rem)', fontWeight: 300, color: 'var(--color-brand-charcoal)', marginBottom: '40px' }}>
          Wishlist
        </h1>

        <AnimatePresence mode="wait">
          {items.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{ textAlign: 'center', padding: '80px 24px', backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #E6E2D8', boxShadow: '0 8px 30px rgba(0,0,0,0.02)' }}
            >
              <div style={{ fontSize: '48px', marginBottom: '24px', color: 'var(--color-brand-gold-light)' }}>♡</div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 300, color: '#0F2A5B', marginBottom: '16px' }}>
                Your wishlist is empty
              </h2>
              <p style={{ fontFamily: 'var(--font-body)', color: 'rgba(15,42,91,0.6)', fontSize: '14px', maxWidth: '380px', margin: '0 auto 32px', lineHeight: 1.7 }}>
                Save pieces you love and come back for them anytime.
              </p>
              <Link
                href="/#collection"
                className="btn-liquid"
                style={{ display: 'inline-block', backgroundColor: '#0F2A5B', color: '#ffffff', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 600, padding: '16px 40px', borderRadius: '4px', textDecoration: 'none', transition: 'background-color 0.3s ease' }}
              >
                Explore Collection
              </Link>
            </motion.div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '24px' }}>
              <AnimatePresence>
                {items.map((item) => {
                  const product = productCache[item.productId];
                  const isExpanded = expandedId === item.productId;
                  return (
                    <motion.div
                      key={item.productId}
                      layout
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                      style={{
                        backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #E6E2D8',
                        overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
                      }}
                    >
                      <Link href={`/product/${item.slug}`} style={{ display: 'block', textDecoration: 'none' }}>
                        <div style={{ position: 'relative', aspectRatio: '3/4', backgroundColor: 'var(--color-brand-blush)' }}>
                          <img src={localResize(item.imageUrl || '/prod-bestseller.webp', 400)} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      </Link>
                      <div style={{ padding: '14px 16px' }}>
                        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--color-brand-charcoal)', margin: '0 0 4px', fontWeight: 400 }}>
                          {item.title}
                        </h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                          <p style={{ fontSize: '0.85rem', color: '#A68026', margin: 0, fontWeight: 500 }}>{fmt(item.priceINR)}</p>
                          {item.compareAtPriceINR && item.compareAtPriceINR > item.priceINR && (
                            <p style={{ fontSize: '0.75rem', color: '#999', margin: 0, textDecoration: 'line-through' }}>{fmt(item.compareAtPriceINR)}</p>
                          )}
                        </div>

                        {addedId === item.productId ? (
                          <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--color-brand-mauve)', fontWeight: 600, margin: '0 0 8px' }}>✦ Added to bag</p>
                        ) : isExpanded && product ? (
                          <div style={{ marginBottom: '10px' }}>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              {SIZE_ORDER.map((size) => {
                                const stock = product.sizes[size] ?? 0;
                                const inStock = stock > 0;
                                return (
                                  <button
                                    key={size}
                                    disabled={!inStock}
                                    onClick={() => handlePickSize(product, size)}
                                    style={{
                                      width: '32px', height: '32px', borderRadius: '6px',
                                      border: '1px solid var(--color-brand-mist)',
                                      backgroundColor: inStock ? 'transparent' : 'var(--color-brand-blush)',
                                      color: 'var(--color-brand-charcoal)',
                                      opacity: inStock ? 1 : 0.35,
                                      cursor: inStock ? 'pointer' : 'not-allowed',
                                      fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600,
                                    }}
                                  >
                                    {size}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}

                        {errorId === item.productId && (
                          <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: '#C0392B', margin: '0 0 8px' }}>Failed to load sizes</p>
                        )}

                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => handleAddToBagClick(item.productId)}
                            disabled={loadingId === item.productId}
                            style={{
                              flex: 1, padding: '10px', backgroundColor: 'var(--color-brand-charcoal)', color: '#fff',
                              border: 'none', borderRadius: '4px', cursor: 'pointer',
                              fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600,
                              textTransform: 'uppercase', letterSpacing: '0.12em',
                              opacity: loadingId === item.productId ? 0.6 : 1,
                            }}
                          >
                            {loadingId === item.productId ? '…' : isExpanded ? 'Pick a size' : 'Add to Bag'}
                          </button>
                          <button
                            onClick={() => remove(item.productId)}
                            style={{
                              padding: '10px 12px', background: 'none', border: '1px solid var(--color-brand-mist)',
                              borderRadius: '4px', cursor: 'pointer', color: 'var(--color-brand-charcoal)',
                              opacity: 0.6, fontFamily: 'var(--font-body)', fontSize: '10px',
                              textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600,
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
