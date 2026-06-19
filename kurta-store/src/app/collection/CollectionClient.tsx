'use client';

import React, { useState, useCallback, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '@/components/providers/CartProvider';
import { useCurrency } from '@/components/providers/CurrencyProvider';
import { trackAddToCart } from '@/lib/analytics';
import type { Product, SizeLabel } from '@/types/schema';

const CATEGORIES = ['All', 'Casual', 'Festive', 'Wedding', 'Work'] as const;
type Category = (typeof CATEGORIES)[number];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
] as const;

export default function CollectionClient({ initialProducts }: { initialProducts: Product[] }) {
  const { addItem } = useCart();
  const { currency, convertPrice } = useCurrency();
  const [activeCategory, setActiveCategory] = useState<Category>('All');
  const [sortBy, setSortBy] = useState<string>('newest');

  // Price formatting helper
  const fmt = useCallback((priceINR: number) => {
    const c = convertPrice(priceINR);
    const sym: Record<string, string> = { INR: '₹', USD: '$', EUR: '€' };
    return `${sym[currency] ?? ''}${c.toFixed(currency === 'INR' ? 0 : 2)}`;
  }, [convertPrice, currency]);

  // Filter and sort products on the client side
  const filteredProducts = useMemo(() => {
    return initialProducts
      .filter((p) => activeCategory === 'All' || p.category === activeCategory)
      .sort((a, b) => {
        if (sortBy === 'price-asc') {
          return a.priceINR - b.priceINR;
        }
        if (sortBy === 'price-desc') {
          return b.priceINR - a.priceINR;
        }
        // newest (default)
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [initialProducts, activeCategory, sortBy]);

  return (
    <main style={{ backgroundColor: '#FAF8F5', minHeight: '100vh', paddingBottom: '80px' }}>

      {/* Editorial Collection Hero Banner */}
      <section style={{ position: 'relative', height: '40vh', display: 'flex', alignItems: 'flex-end', backgroundColor: '#F4ECE1', overflow: 'hidden' }}>
        <Image
          src="/lookbook-banner.webp"
          alt="Minaara Collections"
          fill
          className="object-cover object-center"
          priority
          style={{ opacity: 0.85 }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(12,8,6,0.7) 0%, transparent 80%)' }} />
        <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: '1200px', margin: '0 auto', padding: '0 48px 40px' }}>
          <p style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.25em', color: 'rgba(244,236,225,0.7)', marginBottom: '12px' }}>
            Curated Artisanal Ensembles
          </p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.5rem, 5vw, 4rem)', fontWeight: 300, color: '#ffffff', margin: 0 }}>
            The Collection
          </h1>
        </div>
      </section>

      {/* Filter and Sort Bar */}
      <section style={{ borderBottom: '1px solid #E6E2D8', backgroundColor: '#FAF8F5', position: 'sticky', top: '64px', zIndex: 10 }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '16px 48px' }} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">

          {/* Category Tabs */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                style={{
                  padding: '6px 20px',
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  borderRadius: '100px',
                  border: `1px solid ${activeCategory === cat ? '#8C6F63' : '#E6E2D8'}`,
                  backgroundColor: activeCategory === cat ? '#8C6F63' : 'transparent',
                  color: activeCategory === cat ? '#ffffff' : 'rgba(26,26,26,0.6)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  outline: 'none'
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Sort Selector Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(26,26,26,0.4)' }}>
              Sort By
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{
                padding: '8px 16px',
                fontSize: '10px',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                borderRadius: '4px',
                border: '1px solid #E6E2D8',
                backgroundColor: '#ffffff',
                color: '#1A1A1A',
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                outline: 'none'
              }}
              aria-label="Sort collection"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

        </div>
      </section>

      {/* Product Grid Section */}
      <section style={{ padding: '60px 0' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 48px' }}>

          <AnimatePresence mode="wait">
            {filteredProducts.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ padding: '80px 0', textAlign: 'center', color: 'rgba(26,26,26,0.4)', fontFamily: 'var(--font-body)' }}
              >
                No pieces found in this category.
              </motion.div>
            ) : (
              <motion.div
                key={`${activeCategory}-${sortBy}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="product-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  columnGap: '24px',
                  rowGap: '64px'
                }}
              >
                {filteredProducts.map((product, i) => (
                  <motion.div
                    key={product.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.05, 0.4), duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <CollectionProductCard
                      product={product}
                      fmt={fmt}
                      onAdd={(size) => {
                        const variantId = product.variants.find((v) => v.size === size)?.id || `mock-variant-${product.id}-${size}`;
                        addItem({
                          productId: product.id,
                          variantId,
                          title: product.title,
                          size,
                          quantity: 1,
                          priceINR: product.priceINR,
                          imageUrl: product.images[0] ?? ''
                        });
                        trackAddToCart(product, size, 1);
                      }}
                    />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </section>

    </main>
  );
}

// ── Local Product Card Implementation ───────────────────────────────────────
interface CardProps {
  product: Product;
  fmt: (price: number) => string;
  onAdd: (size: SizeLabel) => void;
}

function CollectionProductCard({ product, fmt, onAdd }: CardProps) {
  const [hovered, setHovered] = useState(false);
  const [hoverSize, setHoverSize] = useState('');

  const firstAvail = Object.entries(product.sizes).find(([, s]) => s > 0)?.[0] ?? '';
  const availSizes = Object.entries(product.sizes).filter(([, s]) => s > 0);

  return (
    <article
      className="product-card"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setHoverSize(''); }}
      style={{
        borderRadius: '12px',
        overflow: 'visible',
        backgroundColor: 'var(--glass-bg)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid var(--glass-border)',
        cursor: 'pointer',
        transition: 'box-shadow 0.35s ease, transform 0.35s ease',
        boxShadow: hovered ? 'var(--glass-shadow)' : '0 2px 8px rgba(26,26,26,0.03)',
        transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
        position: 'relative',
        zIndex: hovered ? 30 : 1,
      }}
    >
      <div style={{ borderRadius: '12px', overflow: 'hidden', border: 'none' }}>
        <Link href={`/product/${product.id}`} style={{ textDecoration: 'none', display: 'block' }}>

          {/* Image */}
          <div style={{ position: 'relative', aspectRatio: '3/4', overflow: 'hidden', backgroundColor: '#EDE9DF' }}>
            {product.images[0] && (
              <Image
                src={product.images[0]}
                alt={product.title}
                fill
                className="object-cover"
                style={{ transition: 'transform 0.65s cubic-bezier(0.76,0,0.24,1)', transform: hovered ? 'scale(1.05)' : 'scale(1)' }}
                sizes="(max-width: 768px) 50vw, 25vw"
              />
            )}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(12,8,6,0.15) 0%, transparent 50%)', opacity: hovered ? 1 : 0, transition: 'opacity 0.4s ease' }} />
            <span style={{ position: 'absolute', top: '12px', left: '12px', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 10px', borderRadius: '4px', backgroundColor: 'var(--glass-bg)', color: 'var(--color-brand-charcoal)', fontWeight: 600, border: '1px solid var(--glass-border)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
              {product.category}
            </span>
          </div>

          {/* Info */}
          <div style={{ padding: '14px 16px 16px', backgroundColor: 'transparent' }}>
            <h3 style={{ fontSize: '0.92rem', fontWeight: 400, color: 'var(--color-brand-charcoal)', margin: '0 0 4px', letterSpacing: '0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-body)' }}>
              {product.title}
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-brand-gold)', margin: 0, fontWeight: 500, fontFamily: 'var(--font-body)' }}>
              {fmt(product.priceINR)}
            </p>
          </div>

        </Link>
      </div>

      {/* Quick-add overlay tray */}
      <div style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: '100%',
        backgroundColor: 'var(--glass-bg)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid var(--glass-border)',
        borderTop: 'none',
        borderRadius: '0 0 12px 12px',
        overflow: 'hidden',
        maxHeight: hovered ? '64px' : '0',
        transition: 'max-height 0.38s cubic-bezier(0.22,1,0.36,1)',
        zIndex: 30,
        boxShadow: hovered ? 'var(--glass-shadow)' : 'none',
      }}>
        <div style={{ padding: '10px 16px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {availSizes.map(([size]) => (
            <button
              key={size}
              onMouseEnter={() => setHoverSize(size)}
              onMouseLeave={() => setHoverSize('')}
              onClick={(e) => { e.preventDefault(); onAdd(size as SizeLabel); }}
              style={{
                fontSize: '10px',
                padding: '4px 10px',
                border: '1px solid var(--color-brand-mauve)',
                borderRadius: '4px',
                backgroundColor: hoverSize === size ? 'var(--color-brand-mauve)' : 'transparent',
                color: hoverSize === size ? '#ffffff' : 'var(--color-brand-charcoal)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                fontFamily: 'var(--font-body)',
                outline: 'none'
              }}
              aria-label={`Add ${size}`}
            >
              {size}
            </button>
          ))}
          {firstAvail && (
            <button
              onClick={(e) => { e.preventDefault(); onAdd(firstAvail as SizeLabel); }}
              style={{
                fontSize: '10px',
                padding: '4px 12px',
                borderRadius: '4px',
                marginLeft: 'auto',
                backgroundColor: 'var(--color-brand-charcoal)',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 500,
                fontFamily: 'var(--font-body)'
              }}
              aria-label="Quick add"
            >
              + Cart
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
