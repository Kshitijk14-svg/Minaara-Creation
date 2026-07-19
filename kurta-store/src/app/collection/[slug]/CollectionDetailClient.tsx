'use client';

import React, { useState, useCallback, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '@/components/providers/CartProvider';
import { useCurrency } from '@/components/providers/CurrencyProvider';
import { trackAddToCart } from '@/lib/analytics';
import type { Product, Collection, SizeLabel } from '@/types/schema';

const SORT_OPTIONS = [
  { value: 'newest',     label: 'Newest' },
  { value: 'price-asc',  label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
] as const;

const CURRENCY_SYMBOLS: Record<string, string> = { INR: '₹', USD: '$', EUR: '€' };

export default function CollectionDetailClient({ collection, products }: { collection: Collection; products: Product[] }) {
  const { addItem }          = useCart();
  const { currency, convertPrice } = useCurrency();
  const [sortBy, setSortBy]  = useState<string>('newest');
  const [hoverSize, setHoverSize] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const fmt = useCallback(
    (p: number) => `${CURRENCY_SYMBOLS[currency] ?? ''}${convertPrice(p).toFixed(currency === 'INR' ? 0 : 2)}`,
    [currency, convertPrice],
  );

  const sorted = useMemo(() => [...products].sort((a, b) => {
    if (sortBy === 'price-asc')  return a.priceINR - b.priceINR;
    if (sortBy === 'price-desc') return b.priceINR - a.priceINR;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }), [products, sortBy]);

  const heroImage = collection.imageUrl || '/lookbook-banner.webp';

  return (
    <main style={{ backgroundColor: '#FAF8F5', minHeight: '100vh', paddingBottom: '80px' }}>

      {/* Collection Hero */}
      <section style={{ position: 'relative', height: '45vh', display: 'flex', alignItems: 'flex-end', overflow: 'hidden' }}>
        <Image src={heroImage} alt={collection.name} fill priority style={{ objectFit: 'cover', objectPosition: 'center', opacity: 0.85 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(12,8,6,0.75) 0%, transparent 70%)' }} />
        <div style={{ position: 'relative', zIndex: 10, maxWidth: '1200px', width: '100%', margin: '0 auto', padding: '0 48px 44px' }}>
          <Link href="/collection" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-body)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(244,236,225,0.6)', textDecoration: 'none', marginBottom: '16px' }}>
            ← All Collections
          </Link>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.5rem, 5vw, 4rem)', fontWeight: 300, color: '#ffffff', margin: 0, lineHeight: 1 }}>
            {collection.name}
          </h1>
          {collection.description && (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'rgba(244,236,225,0.7)', marginTop: '12px', maxWidth: '480px', lineHeight: 1.7 }}>
              {collection.description}
            </p>
          )}
        </div>
      </section>

      {/* Sort + Count Bar */}
      <section style={{ borderBottom: '1px solid #E6E2D8', backgroundColor: '#FAF8F5' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '14px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-brand-charcoal)', opacity: 0.5 }}>
            {sorted.length} piece{sorted.length !== 1 ? 's' : ''}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-brand-charcoal)', opacity: 0.4 }}>Sort</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ padding: '8px 14px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', borderRadius: '4px', border: '1px solid #E6E2D8', backgroundColor: '#ffffff', color: '#1A1A1A', cursor: 'pointer', fontFamily: 'var(--font-body)', outline: 'none' }}>
              {SORT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
        </div>
      </section>

      {/* Product Grid */}
      <section style={{ padding: '60px 0' }}>
        <div className="page-container" style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <AnimatePresence mode="wait">
            {sorted.length === 0 ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: 'center', padding: '80px 0', fontFamily: 'var(--font-body)', color: 'var(--color-brand-charcoal)', opacity: 0.5 }}>
                No pieces in this collection yet.
              </motion.div>
            ) : (
              <motion.div
                key={sortBy}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
                style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', columnGap: '24px', rowGap: '64px' }}
              >
                {sorted.map((product, i) => {
                  const hovered    = hoveredId === product.id;
                  const availSizes = Object.entries(product.sizes).filter(([, s]) => s > 0);
                  const firstAvail = availSizes[0]?.[0] ?? '';
                  const isOnSale   = product.compareAtPriceINR && product.compareAtPriceINR > product.priceINR;

                  return (
                    <motion.article
                      key={product.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.05, 0.4), duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                      onMouseEnter={() => setHoveredId(product.id)}
                      onMouseLeave={() => { setHoveredId(null); setHoverSize(''); }}
                      style={{
                        borderRadius: '12px', overflow: 'visible',
                        backgroundColor: 'var(--glass-bg)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                        border: '1px solid var(--glass-border)', cursor: 'pointer',
                        transition: 'box-shadow 0.35s, transform 0.35s',
                        boxShadow: hovered ? 'var(--glass-shadow)' : '0 2px 8px rgba(26,26,26,0.03)',
                        transform: hovered ? 'translateY(-3px)' : 'none',
                        position: 'relative', zIndex: hovered ? 30 : 1,
                      }}
                    >
                      <div style={{ borderRadius: '12px', overflow: 'hidden' }}>
                        <Link href={`/product/${product.slug}`} style={{ textDecoration: 'none', display: 'block' }}>
                          <div style={{ position: 'relative', aspectRatio: '3/4', overflow: 'hidden', backgroundColor: '#EDE9DF' }}>
                            {product.images[0] && (
                              <Image src={product.images[0]} alt={product.title} fill sizes="(max-width: 768px) 50vw, 25vw"
                                style={{ objectFit: 'cover', transition: 'transform 0.65s cubic-bezier(0.76,0,0.24,1)', transform: hovered ? 'scale(1.05)' : 'scale(1)' }} />
                            )}
                            {isOnSale && (
                              <span style={{ position: 'absolute', top: '12px', right: '12px', backgroundColor: 'var(--color-brand-charcoal)', color: '#fff', padding: '3px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Sale</span>
                            )}
                          </div>
                          <div style={{ padding: '14px 16px 16px' }}>
                            <h3 style={{ fontSize: '0.92rem', fontWeight: 400, color: 'var(--color-brand-charcoal)', margin: '0 0 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-body)' }}>
                              {product.title}
                            </h3>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                              <span style={{ fontSize: '0.85rem', color: 'var(--color-brand-gold)', fontWeight: 500, fontFamily: 'var(--font-body)' }}>{fmt(product.priceINR)}</span>
                              {isOnSale && product.compareAtPriceINR && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-brand-charcoal)', opacity: 0.35, textDecoration: 'line-through', fontFamily: 'var(--font-body)' }}>{fmt(product.compareAtPriceINR)}</span>
                              )}
                            </div>
                          </div>
                        </Link>
                      </div>

                      {/* Quick-add tray */}
                      <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', backgroundColor: 'var(--glass-bg)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid var(--glass-border)', borderTop: 'none', borderRadius: '0 0 12px 12px', overflow: 'hidden', maxHeight: hovered ? '64px' : '0', transition: 'max-height 0.38s cubic-bezier(0.22,1,0.36,1)', zIndex: 30 }}>
                        <div style={{ padding: '10px 16px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                          {availSizes.map(([size]) => (
                            <button key={size}
                              onMouseEnter={() => setHoverSize(size)}
                              onMouseLeave={() => setHoverSize('')}
                              onClick={(e) => {
                                e.preventDefault();
                                addItem({ productId: product.id, variantId: product.variants.find((v) => v.size === size)?.id ?? '', title: product.title, size: size as SizeLabel, quantity: 1, priceINR: product.priceINR, imageUrl: product.images[0] ?? '' });
                                trackAddToCart(product, size, 1);
                              }}
                              style={{ fontSize: '10px', padding: '4px 10px', border: '1px solid var(--color-brand-mauve)', borderRadius: '4px', backgroundColor: hoverSize === size ? 'var(--color-brand-mauve)' : 'transparent', color: hoverSize === size ? '#fff' : 'var(--color-brand-charcoal)', cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'var(--font-body)' }}
                            >
                              {size}
                            </button>
                          ))}
                          {firstAvail && (
                            <button onClick={(e) => { e.preventDefault(); addItem({ productId: product.id, variantId: product.variants.find((v) => v.size === firstAvail)?.id ?? '', title: product.title, size: firstAvail as SizeLabel, quantity: 1, priceINR: product.priceINR, imageUrl: product.images[0] ?? '' }); trackAddToCart(product, firstAvail, 1); }}
                              style={{ fontSize: '10px', padding: '4px 12px', borderRadius: '4px', marginLeft: 'auto', backgroundColor: 'var(--color-brand-charcoal)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 500, fontFamily: 'var(--font-body)' }}>
                              + Cart
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.article>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
    </main>
  );
}
