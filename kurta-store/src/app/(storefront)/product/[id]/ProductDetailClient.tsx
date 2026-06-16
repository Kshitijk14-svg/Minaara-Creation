'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { useCart } from '@/components/providers/CartProvider';
import { useCurrency } from '@/components/providers/CurrencyProvider';
import { SizeGuideModal } from '@/components/ui/SizeGuideModal';
import { trackViewItem, trackAddToCart } from '@/lib/analytics';
import type { Product } from '@/types/schema';
import { MagneticLink } from '@/components/ui/MagneticLink';

interface ProductDetailClientProps {
  product: Product;
}

export function ProductDetailClient({ product }: ProductDetailClientProps) {
  const [selectedSize, setSelectedSize] = useState<string>(() => {
    const firstAvailable = Object.entries(product.sizes).find(([, stock]) => stock > 0);
    return firstAvailable ? firstAvailable[0] : '';
  });
  const [isSizeGuideOpen, setIsSizeGuideOpen] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({
    description: true,
    fabric: false,
    shipping: false,
  });

  const { addItem, items } = useCart();
  const { currency, setCurrency, convertPrice } = useCurrency();
  const cartCount = items.reduce((s, i) => s + i.quantity, 0);

  const CURRENCIES = ['INR', 'USD', 'EUR'] as const;

  const formatPrice = useCallback(
    (priceINR: number) => {
      const converted = convertPrice(priceINR);
      const symbols: Record<string, string> = { INR: '₹', USD: '$', EUR: '€' };
      return `${symbols[currency] ?? ''}${converted.toFixed(currency === 'INR' ? 0 : 2)}`;
    },
    [convertPrice, currency],
  );

  // Fire trackViewItem on mount
  useEffect(() => {
    trackViewItem(product);
  }, [product]);

  // Track scroll to display sticky bottom buy-bar
  useEffect(() => {
    const handleScroll = () => {
      const atcButton = document.getElementById('add-to-cart-btn');
      if (atcButton) {
        const rect = atcButton.getBoundingClientRect();
        setShowStickyBar(rect.bottom < 0);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // IntersectionObserver for Fabric Unroll Reveal
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    const unrolls = document.querySelectorAll('.fabric-unroll');
    unrolls.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [product]);

  const handleAddToCart = useCallback(() => {
    if (!selectedSize) return;
    addItem({
      productId: product.id,
      title: product.title,
      size: selectedSize,
      quantity: 1,
      priceINR: product.priceINR,
      imageUrl: product.images[0] ?? '',
    });
    trackAddToCart(product, selectedSize, 1);
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);
  }, [selectedSize, product, addItem]);

  const toggleAccordion = (tab: string) => {
    setOpenAccordions((prev) => ({ ...prev, [tab]: !prev[tab] }));
  };

  return (
    <>
      {/* Scrolling Ticker Announcement Bar */}
      <div className="w-full bg-brand-charcoal py-2 text-white overflow-hidden select-none border-b border-brand-mist/10 relative z-50">
        <div className="flex animate-ticker">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="flex items-center gap-16 px-8 text-[9px] tracking-[0.25em] uppercase font-body text-brand-blush">
              <span>✦ Free Shipping on Orders Above ₹2000</span>
              <span>✦ 10% Off on Your First Order - Code: WELCOME10</span>
              <span>✦ Handcrafted with Natural Organic Dyes</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Sticky Navigation (matches homepage) ── */}
      <nav
        className="sticky top-0 left-0 right-0 z-45 flex items-center justify-between px-6 md:px-12 py-4"
        style={{
          backgroundColor: 'rgba(250, 248, 245, 0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1.5px solid var(--color-brand-mist)',
        }}
      >
        {/* Left Side Links */}
        <div className="flex items-center gap-8 w-1/3 justify-start">
          <MagneticLink as="div">
            <Link
              href="/#collection"
              className="text-[10px] uppercase tracking-[0.15em] transition-opacity hover:opacity-100"
              style={{ color: 'var(--color-brand-charcoal)', opacity: 0.65, fontFamily: 'var(--font-body)', fontWeight: 500 }}
            >
              Collection
            </Link>
          </MagneticLink>
          <MagneticLink as="div">
            <Link
              href="/lookbook"
              className="text-[10px] uppercase tracking-[0.15em] transition-opacity hover:opacity-100"
              style={{ color: 'var(--color-brand-charcoal)', opacity: 0.65, fontFamily: 'var(--font-body)', fontWeight: 500 }}
            >
              Lookbook
            </Link>
          </MagneticLink>
        </div>

        {/* Centered Brand Name */}
        <div className="flex justify-center w-1/3 text-center">
          <MagneticLink as="div">
            <Link
              href="/"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.6rem',
                color: 'var(--color-brand-charcoal)',
                letterSpacing: '0.04em',
                fontWeight: 300,
              }}
            >
              Minaara Creation
            </Link>
          </MagneticLink>
        </div>

        {/* Right Side Utilities */}
        <div className="flex items-center gap-8 w-1/3 justify-end">
          {/* Currency Selector */}
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as 'INR' | 'USD' | 'EUR')}
            className="text-[9px] uppercase tracking-[0.1em] border border-brand-mist rounded-sm px-2 py-0.5 focus:outline-none"
            style={{
              borderColor: 'var(--color-brand-mist)',
              color: 'var(--color-brand-charcoal)',
              backgroundColor: 'transparent',
              fontFamily: 'var(--font-body)',
            }}
            id="currency-selector"
            aria-label="Select currency"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <MagneticLink as="div">
            <Link
              href="/cart"
              className="relative text-[10px] uppercase tracking-[0.15em] transition-opacity hover:opacity-100 flex items-center gap-2"
              style={{ color: 'var(--color-brand-charcoal)', opacity: 0.65, fontFamily: 'var(--font-body)', fontWeight: 500 }}
              id="nav-cart-link"
            >
              Cart
              {cartCount > 0 && (
                <motion.span
                  key={cartCount}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex items-center justify-center rounded-full text-white"
                  style={{
                    width: '18px',
                    height: '18px',
                    fontSize: '0.6rem',
                    backgroundColor: 'var(--color-brand-mauve)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {cartCount}
                </motion.span>
              )}
            </Link>
          </MagneticLink>
        </div>
      </nav>

      {/* ── Main Detail Content ── */}
      <main
        className="min-h-screen pb-24"
        style={{ backgroundColor: 'var(--color-brand-ivory)' }}
      >
        {/* Breadcrumb */}
        <div className="px-6 md:px-12 py-6">
          <nav className="flex gap-2 text-[9px] uppercase tracking-[0.2em]" aria-label="Breadcrumb">
            <Link href="/" className="hover:opacity-60 transition-opacity" style={{ color: 'var(--color-brand-mauve)' }}>
              Collection
            </Link>
            <span style={{ color: 'var(--color-brand-charcoal)', opacity: 0.3 }}>/</span>
            <span style={{ color: 'var(--color-brand-charcoal)', opacity: 0.6 }}>{product.title}</span>
          </nav>
        </div>

        <div className="px-6 md:px-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-20">
            
            {/* Image Gallery - Stacked on Desktop, Snap Scroll on Mobile */}
            <div className="flex flex-col gap-6">
              {/* Desktop Stacked View */}
              <div className="hidden md:flex flex-col gap-6">
                {product.images.map((img, idx) => (
                  <div
                    key={idx}
                    className="relative aspect-[3/4] w-full rounded-md overflow-hidden border border-brand-mist/20 bg-brand-smoke fabric-unroll"
                  >
                    <Image
                      src={img}
                      alt={`${product.title} view ${idx + 1}`}
                      fill
                      className="object-cover transition-transform duration-700 ease-out-silk hover:scale-102"
                      priority={idx === 0}
                      sizes="(min-width: 768px) 50vw, 100vw"
                    />
                  </div>
                ))}
              </div>

              {/* Mobile snap horizontal scroll list */}
              <div className="flex md:hidden overflow-x-auto gap-4 snap-x snap-mandatory scrollbar-none pb-4">
                {product.images.map((img, idx) => (
                  <div
                    key={idx}
                    className="relative w-[82vw] aspect-[3/4] shrink-0 snap-start rounded-md overflow-hidden border border-brand-mist/20 bg-brand-smoke"
                  >
                    <Image
                      src={img}
                      alt={`${product.title} view ${idx + 1}`}
                      fill
                      className="object-cover"
                      priority={idx === 0}
                      sizes="82vw"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Product Details - Sticky Column on Desktop */}
            <div className="flex flex-col gap-6 pt-0 md:pt-4 md:sticky md:top-24 md:h-fit">
              <div>
                <p
                  className="text-[10px] uppercase tracking-[0.2em] mb-2 font-body font-semibold"
                  style={{ color: 'var(--color-brand-mauve)' }}
                >
                  {product.category}
                </p>
                <h1
                  className="text-3xl lg:text-4xl leading-tight font-display text-brand-charcoal font-light"
                  style={{ letterSpacing: '0.01em' }}
                >
                  {product.title}
                </h1>
                <p
                  className="text-xl mt-3 font-mono font-medium"
                  style={{ color: 'var(--color-brand-mauve)' }}
                >
                  {formatPrice(product.priceINR)}
                </p>
              </div>

              <div className="section-divider is-visible" />

              {/* Size Selector */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p
                    className="text-[10px] uppercase tracking-[0.2em] font-semibold text-brand-charcoal"
                  >
                    Size
                    {selectedSize && (
                      <span style={{ color: 'var(--color-brand-mauve)' }}> — {selectedSize}</span>
                    )}
                  </p>
                  <button
                    onClick={() => setIsSizeGuideOpen(true)}
                    className="text-[9px] uppercase tracking-[0.2em] underline underline-offset-4 hover:opacity-60 transition-opacity"
                    style={{ color: 'var(--color-brand-mauve)' }}
                    id="size-guide-trigger"
                  >
                    Size Guide
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {Object.entries(product.sizes).map(([size, stock]) => (
                    <button
                      key={size}
                      onClick={() => stock > 0 && setSelectedSize(size)}
                      disabled={stock === 0}
                      className={`w-14 h-10 text-xs border rounded-sm transition-all duration-200 ${
                        stock === 0 ? 'opacity-30 cursor-not-allowed line-through' : 'hover:opacity-85'
                      }`}
                      style={{
                        borderColor: 'var(--color-brand-mist)',
                        backgroundColor: selectedSize === size ? 'var(--color-brand-mauve)' : 'transparent',
                        color: selectedSize === size ? 'white' : 'var(--color-brand-charcoal)',
                      }}
                      aria-label={`Size ${size}${stock === 0 ? ' — out of stock' : ` — ${stock} left`}`}
                      id={`size-btn-${size}`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              {/* Add to Cart Actions */}
              <div className="flex gap-3 mt-2">
                <button
                  onClick={handleAddToCart}
                  disabled={!selectedSize}
                  className="flex-1 py-4 text-xs uppercase tracking-[0.25em] rounded-sm transition-all duration-300 font-semibold disabled:opacity-40"
                  style={{
                    backgroundColor: addedToCart ? 'var(--color-brand-charcoal)' : 'var(--color-brand-mauve)',
                    color: 'white',
                  }}
                  id="add-to-cart-btn"
                >
                  {addedToCart ? '✓ Added to Cart' : selectedSize ? 'Add to Cart' : 'Select a Size'}
                </button>
                <Link
                  href="/cart"
                  className="px-6 py-4 text-xs uppercase tracking-[0.2em] rounded-sm border transition-all duration-300 hover:opacity-80 flex items-center justify-center font-semibold"
                  style={{
                    borderColor: 'var(--color-brand-mauve)',
                    color: 'var(--color-brand-mauve)',
                  }}
                >
                  View Cart
                </Link>
              </div>

              {/* Accordions */}
              <div className="mt-4 border-t border-brand-mist/60">
                {/* Description Accordion */}
                <div className="border-b border-brand-mist/60">
                  <button
                    onClick={() => toggleAccordion('description')}
                    className="w-full flex justify-between items-center py-4 text-[10px] uppercase tracking-[0.2em] font-semibold text-brand-charcoal"
                  >
                    <span>Description</span>
                    <span className="text-base font-light">{openAccordions.description ? '−' : '+'}</span>
                  </button>
                  <AnimatePresence initial={false}>
                    {openAccordions.description && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.35, ease: 'easeInOut' }}
                        className="overflow-hidden"
                      >
                        <p className="pb-6 text-sm text-brand-charcoal/70 leading-relaxed font-body">
                          {product.description}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Fabric & Care Accordion */}
                <div className="border-b border-brand-mist/60">
                  <button
                    onClick={() => toggleAccordion('fabric')}
                    className="w-full flex justify-between items-center py-4 text-[10px] uppercase tracking-[0.2em] font-semibold text-brand-charcoal"
                  >
                    <span>Fabric & Care</span>
                    <span className="text-base font-light">{openAccordions.fabric ? '−' : '+'}</span>
                  </button>
                  <AnimatePresence initial={false}>
                    {openAccordions.fabric && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.35, ease: 'easeInOut' }}
                        className="overflow-hidden"
                      >
                        <ul className="pb-6 text-sm text-brand-charcoal/70 leading-relaxed font-body list-disc pl-5 space-y-1">
                          <li>100% Handloom Organic Cotton / Linen</li>
                          <li>Dyed using traditional, natural vegetable extracts</li>
                          <li>Cold gentle hand wash separately</li>
                          <li>Dry in shade to preserve print & color richness</li>
                        </ul>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Shipping & Returns Accordion */}
                <div className="border-b border-brand-mist/60">
                  <button
                    onClick={() => toggleAccordion('shipping')}
                    className="w-full flex justify-between items-center py-4 text-[10px] uppercase tracking-[0.2em] font-semibold text-brand-charcoal"
                  >
                    <span>Shipping & Returns</span>
                    <span className="text-base font-light">{openAccordions.shipping ? '−' : '+'}</span>
                  </button>
                  <AnimatePresence initial={false}>
                    {openAccordions.shipping && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.35, ease: 'easeInOut' }}
                        className="overflow-hidden"
                      >
                        <p className="pb-6 text-sm text-brand-charcoal/70 leading-relaxed font-body">
                          Free standard shipping within India on orders above ₹2000. Orders are processed & dispatched within 2-4 business days. Easy exchanges and sizing swaps are available within 7 days of delivery.
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* SKU & Extra specs details */}
              <div
                className="rounded-md p-5 text-xs space-y-2 border border-brand-mist/20"
                style={{ backgroundColor: 'var(--color-brand-blush)' }}
              >
                <p className="text-brand-charcoal">
                  <span className="opacity-60">SKU:</span>{' '}
                  <span className="font-mono" style={{ fontFamily: 'var(--font-mono)' }}>
                    MC-{product.id.slice(0, 8).toUpperCase()}
                  </span>
                </p>
                <p className="text-brand-charcoal">
                  <span className="opacity-60">Category:</span> {product.category}
                </p>
                <p className="text-brand-charcoal">
                  <span className="opacity-60">Availability:</span>{' '}
                  {Object.values(product.sizes).some((s) => s > 0) ? 'In Stock' : 'Out of Stock'}
                </p>
              </div>

            </div>
          </div>
        </div>
      </main>

      {/* Sticky Bottom Add-to-Cart Drawer */}
      <AnimatePresence>
        {showStickyBar && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ ease: [0.22, 1, 0.36, 1], duration: 0.4 }}
            className="fixed bottom-0 left-0 right-0 z-40 bg-brand-ivory border-t border-brand-mist shadow-[0_-10px_30px_rgba(0,0,0,0.08)] px-6 py-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div className="relative w-10 h-12 rounded-sm overflow-hidden bg-brand-smoke border border-brand-mist/20">
                <Image src={product.images[0] || ''} alt={product.title} fill className="object-cover" sizes="40px" />
              </div>
              <div>
                <h4 className="text-[10px] uppercase tracking-widest font-semibold text-brand-charcoal">{product.title}</h4>
                <p className="text-xs font-mono font-medium text-brand-mauve">{formatPrice(product.priceINR)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline text-[9px] uppercase tracking-widest text-brand-charcoal/60">
                Selected Size: {selectedSize || 'None'}
              </span>
              <button
                onClick={handleAddToCart}
                disabled={!selectedSize}
                className="py-3 px-8 text-[9px] uppercase tracking-[0.2em] rounded-sm transition-all duration-300 font-semibold disabled:opacity-40"
                style={{
                  backgroundColor: addedToCart ? 'var(--color-brand-charcoal)' : 'var(--color-brand-mauve)',
                  color: 'white',
                }}
              >
                {addedToCart ? '✓ Added' : 'Add to Cart'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <SizeGuideModal isOpen={isSizeGuideOpen} onClose={() => setIsSizeGuideOpen(false)} />
    </>
  );
}
