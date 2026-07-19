'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '@/components/providers/CartProvider';
import { useCurrency } from '@/components/providers/CurrencyProvider';
import { SizeGuideModal } from '@/components/ui/SizeGuideModal';
import ProductVideoBubble from './ProductVideoBubble';
import { WishlistHeart } from '@/components/ui/WishlistHeart';
import { trackViewItem, trackAddToCart } from '@/lib/analytics';
import { localResize } from '@/lib/media';
import type { Product, SizeLabel } from '@/types/schema';

const SIZE_ORDER: SizeLabel[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const CURRENCY_SYMBOLS: Record<string, string> = { INR: '₹', USD: '$', EUR: '€' };

export default function ProductDetailClient({ product }: { product: Product }) {
  const { addItem } = useCart();
  const { currency, convertPrice } = useCurrency();

  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedSize, setSelectedSize]   = useState<SizeLabel | null>(null);
  const [quantity, setQuantity]           = useState(1);
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [addedToCart, setAddedToCart]     = useState(false);
  const [sizeError, setSizeError]         = useState(false);

  const images = product.images.length > 0 ? product.images : ['/prod-bestseller.webp'];

  const fmt = useCallback(
    (p: number) => `${CURRENCY_SYMBOLS[currency] ?? ''}${convertPrice(p).toFixed(currency === 'INR' ? 0 : 2)}`,
    [currency, convertPrice],
  );

  useEffect(() => {
    trackViewItem(product);
  }, [product]);

  const handleAddToCart = () => {
    if (!selectedSize) { setSizeError(true); return; }
    setSizeError(false);

    const imageUrl = images[0] ?? '';
    addItem({ productId: product.id, variantId: product.variants.find((v) => v.size === selectedSize)?.id ?? '', title: product.title, size: selectedSize, imageUrl, quantity, priceINR: product.priceINR });
    trackAddToCart(product, selectedSize, quantity);

    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2200);
  };

  const totalStock = selectedSize ? (product.sizes[selectedSize] ?? 0) : null;
  const isOnSale   = product.compareAtPriceINR && product.compareAtPriceINR > product.priceINR;

  const next = useCallback(() => setSelectedImage((i) => (i + 1) % images.length), [images.length]);
  const prev = useCallback(() => setSelectedImage((i) => (i - 1 + images.length) % images.length), [images.length]);

  const handleDragEnd = (_: unknown, info: { offset: { x: number } }) => {
    if (info.offset.x <= -60) next();
    else if (info.offset.x >= 60) prev();
  };

  return (
    <main style={{ backgroundColor: '#FAF8F5', minHeight: '100vh', paddingTop: '40px', paddingBottom: '80px' }}>
      <div className="pdp-container" style={{ maxWidth: '1200px', margin: '0 auto' }}>

        {/* Breadcrumb */}
        <nav style={{ marginBottom: '32px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Link href="/" style={{ fontFamily: 'var(--font-body)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-brand-charcoal)', opacity: 0.5, textDecoration: 'none' }}>
            Home
          </Link>
          <span style={{ opacity: 0.3, fontSize: '11px', color: 'var(--color-brand-charcoal)' }}>/</span>
          <Link href="/collection" style={{ fontFamily: 'var(--font-body)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-brand-charcoal)', opacity: 0.5, textDecoration: 'none' }}>
            Collection
          </Link>
          <span style={{ opacity: 0.3, fontSize: '11px', color: 'var(--color-brand-charcoal)' }}>/</span>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-brand-charcoal)' }}>
            {product.title}
          </span>
        </nav>

        <div className="pdp-grid" style={{ display: 'grid', alignItems: 'start' }}>

          {/* ── LEFT: Image Gallery ─────────────────────────────────────────── */}
          <div>
            {/* Main Image */}
            <div style={{ position: 'relative' }}>
              <motion.div
                key={selectedImage}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.35 }}
                drag={images.length > 1 ? 'x' : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.2}
                onDragEnd={handleDragEnd}
                style={{ position: 'relative', width: '100%', aspectRatio: '3/4', borderRadius: '16px', overflow: 'hidden', backgroundColor: 'var(--color-brand-blush)', touchAction: 'pan-y' }}
              >
                <img
                  src={localResize(images[selectedImage], 1000)}
                  alt={`${product.title} — view ${selectedImage + 1}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
                  draggable={false}
                />
                {isOnSale && (
                  <div style={{ position: 'absolute', top: '16px', left: '16px', backgroundColor: 'var(--color-brand-charcoal)', color: '#fff', padding: '4px 10px', borderRadius: '4px', fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    Sale
                  </div>
                )}
              </motion.div>

              {images.length > 1 && (
                <>
                  <button
                    onClick={prev}
                    aria-label="Previous image"
                    style={{
                      position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                      width: '40px', height: '40px', borderRadius: '50%', border: 'none',
                      backgroundColor: 'rgba(250,248,245,0.85)', color: 'var(--color-brand-charcoal)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '18px', boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                    }}
                  >
                    ‹
                  </button>
                  <button
                    onClick={next}
                    aria-label="Next image"
                    style={{
                      position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                      width: '40px', height: '40px', borderRadius: '50%', border: 'none',
                      backgroundColor: 'rgba(250,248,245,0.85)', color: 'var(--color-brand-charcoal)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '18px', boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                    }}
                  >
                    ›
                  </button>
                </>
              )}
            </div>

            {/* Thumbnails */}
            {images.length > 1 && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px', overflowX: 'auto', paddingBottom: '4px' }}>
                {images.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedImage(i)}
                    style={{
                      width: '64px', height: '80px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0,
                      border: selectedImage === i ? '2px solid var(--color-brand-charcoal)' : '2px solid transparent',
                      cursor: 'pointer', padding: 0, background: 'none', transition: 'border-color 0.2s',
                    }}
                  >
                    <img src={localResize(url, 160)} alt={`View ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── RIGHT: Product Details ──────────────────────────────────────── */}
          <div className="pdp-info-panel">

            {/* Category tag */}
            {product.category && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--color-brand-mauve)', marginBottom: '12px' }}>
                {product.category}
              </p>
            )}

            {/* Title */}
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 300, color: 'var(--color-brand-charcoal)', lineHeight: 1.1, marginBottom: '20px' }}>
              {product.title}
            </h1>

            {/* Price */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '28px' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 400, color: 'var(--color-brand-charcoal)' }}>
                {fmt(product.priceINR)}
              </span>
              {isOnSale && product.compareAtPriceINR && (
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '1rem', color: 'var(--color-brand-charcoal)', opacity: 0.4, textDecoration: 'line-through' }}>
                  {fmt(product.compareAtPriceINR)}
                </span>
              )}
            </div>

            {/* Divider */}
            <div style={{ width: '100%', height: '1px', backgroundColor: 'var(--color-brand-mist)', marginBottom: '28px' }} />

            {/* Size Selector */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-brand-charcoal)', fontWeight: 600 }}>
                  {selectedSize ? `Size: ${selectedSize}` : 'Select Size'}
                </span>
                <button
                  onClick={() => setSizeGuideOpen(true)}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-brand-mauve)', textDecoration: 'underline', textUnderlineOffset: '3px' }}
                >
                  Size Guide
                </button>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {SIZE_ORDER.map((size) => {
                  const stock   = product.sizes[size] ?? 0;
                  const inStock = stock > 0;
                  const active  = selectedSize === size;
                  return (
                    <button
                      key={size}
                      disabled={!inStock}
                      onClick={() => { setSelectedSize(size); setSizeError(false); }}
                      style={{
                        width: '48px', height: '48px', borderRadius: '8px', border: active ? '2px solid var(--color-brand-charcoal)' : '1px solid var(--color-brand-mist)',
                        backgroundColor: active ? 'var(--color-brand-charcoal)' : inStock ? 'transparent' : 'var(--color-brand-blush)',
                        color: active ? '#fff' : inStock ? 'var(--color-brand-charcoal)' : 'var(--color-brand-charcoal)',
                        opacity: inStock ? 1 : 0.35,
                        cursor: inStock ? 'pointer' : 'not-allowed',
                        fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 600,
                        transition: 'all 0.2s', position: 'relative',
                      }}
                    >
                      {size}
                      {!inStock && (
                        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="100%" height="100%" viewBox="0 0 48 48" style={{ position: 'absolute', inset: 0 }}>
                            <line x1="4" y1="4" x2="44" y2="44" stroke="var(--color-brand-mist)" strokeWidth="1" />
                          </svg>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <AnimatePresence>
                {sizeError && (
                  <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    style={{ marginTop: '8px', fontFamily: 'var(--font-body)', fontSize: '11px', color: '#C0392B' }}
                  >
                    Please select a size before adding to cart.
                  </motion.p>
                )}
              </AnimatePresence>

              {totalStock !== null && totalStock <= 3 && totalStock > 0 && (
                <p style={{ marginTop: '8px', fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--color-brand-gold)', fontWeight: 600 }}>
                  Only {totalStock} left in this size
                </p>
              )}
            </div>

            {/* Quantity Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '28px' }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-brand-charcoal)', fontWeight: 600 }}>
                Qty
              </span>
              <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--color-brand-mist)', borderRadius: '100px', padding: '4px' }}>
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  style={{ width: '32px', height: '32px', borderRadius: '50%', border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--color-brand-charcoal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  −
                </button>
                <span style={{ padding: '0 16px', fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 500, color: 'var(--color-brand-charcoal)', minWidth: '32px', textAlign: 'center' }}>
                  {quantity}
                </span>
                <button
                  onClick={() => setQuantity((q) => Math.min(q + 1, totalStock ?? 10))}
                  style={{ width: '32px', height: '32px', borderRadius: '50%', border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--color-brand-charcoal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  +
                </button>
              </div>
            </div>

            {/* Add to Cart */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '28px' }}>
              <motion.button
                onClick={handleAddToCart}
                whileTap={{ scale: 0.97 }}
                style={{
                  flex: 1, padding: '18px 24px',
                  backgroundColor: addedToCart ? 'var(--color-brand-mauve)' : 'var(--color-brand-charcoal)',
                  color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer',
                  fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.2em', transition: 'background-color 0.3s',
                }}
              >
                {addedToCart ? '✦ Added to Bag' : 'Add to Bag'}
              </motion.button>
              <Link
                href="/cart"
                style={{
                  padding: '18px 24px', border: '1px solid var(--color-brand-mist)', borderRadius: '4px',
                  fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase',
                  letterSpacing: '0.15em', color: 'var(--color-brand-charcoal)', textDecoration: 'none',
                  display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', transition: 'border-color 0.2s',
                }}
              >
                View Bag
              </Link>
              <WishlistHeart
                item={{
                  productId: product.id, slug: product.slug, title: product.title,
                  imageUrl: images[0] ?? '', priceINR: product.priceINR,
                  compareAtPriceINR: product.compareAtPriceINR,
                }}
                size={20}
                style={{
                  width: '58px', height: '58px', border: '1px solid var(--color-brand-mist)', borderRadius: '4px',
                  flexShrink: 0,
                }}
              />
            </div>

            {/* WhatsApp Fallback */}
            {process.env.NEXT_PUBLIC_WHATSAPP_NUMBER && (
              <a
                href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER}?text=${encodeURIComponent(`Hi, I'd like to order: ${product.title}${selectedSize ? ` (Size: ${selectedSize})` : ''} — ₹${product.priceINR}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '14px 24px', border: '1px solid #25D366', borderRadius: '4px', color: '#25D366', textDecoration: 'none', fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '28px' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Order via WhatsApp
              </a>
            )}

            {/* Description */}
            <div>
              <h2 style={{ fontFamily: 'var(--font-body)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--color-brand-charcoal)', fontWeight: 600, marginBottom: '12px' }}>
                About this piece
              </h2>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', lineHeight: 1.8, color: 'var(--color-brand-charcoal)', opacity: 0.75 }}>
                {product.description}
              </p>
            </div>

            {/* Trust badges */}
            <div style={{ display: 'flex', gap: '24px', marginTop: '28px', paddingTop: '24px', borderTop: '1px solid var(--color-brand-mist)' }}>
              {[['✦', 'Free shipping over ₹2000'], ['⟳', 'Easy 7-day returns'], ['◇', 'Authentic handcraft']].map(([icon, text]) => (
                <div key={text} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0, textAlign: 'center' }}>
                  <span style={{ color: 'var(--color-brand-gold)', fontSize: '16px' }}>{icon}</span>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-brand-charcoal)', opacity: 0.6 }}>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <SizeGuideModal isOpen={sizeGuideOpen} onClose={() => setSizeGuideOpen(false)} />

      {product.reelVideoUrl && (
        <ProductVideoBubble
          videoUrl={product.reelVideoUrl}
          posterUrl={product.reelVideoPosterUrl}
          productId={product.id}
        />
      )}
    </main>
  );
}
