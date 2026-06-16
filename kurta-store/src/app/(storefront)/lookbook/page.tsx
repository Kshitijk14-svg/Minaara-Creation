'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { LookbookHotspot } from '@/components/ui/LookbookHotspot';
import { BlindReveal } from '@/components/ui/BlindReveal';
import { MagneticLink } from '@/components/ui/MagneticLink';
import { NarrativeLoader } from '@/components/ui/NarrativeLoader';
import { useInkBleed } from '@/components/ui/useInkBleed';
import type { DesignConfig, Product, LookbookHotspotData } from '@/types/schema';

const HOTSPOT_POSITIONS = [
  { x: 25, y: 30 },
  { x: 68, y: 45 },
  { x: 40, y: 65 },
  { x: 80, y: 25 },
];

export default function LookbookPage() {
  const bgRef = useRef<HTMLDivElement>(null);
  const [designConfig, setDesignConfig] = useState<DesignConfig | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [blindDone, setBlindDone] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [configRes, productsRes] = await Promise.all([
          fetch('/api/config/design'),
          fetch('/api/products?isActive=true&limit=4'),
        ]);
        if (configRes.ok) {
          setDesignConfig((await configRes.json()) as DesignConfig);
        }
        if (productsRes.ok) {
          const data = (await productsRes.json()) as { products: Product[] };
          setProducts(data.products);
        }
      } catch {
        // Fail silently
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, []);

  // Ink Bleed on headings
  useInkBleed('.ink-bleed');

  // GSAP parallax
  useEffect(() => {
    if (!bgRef.current) return;
    let ctx: { revert: () => void } | null = null;

    async function initParallax() {
      const { gsap } = await import('gsap');
      const { ScrollTrigger } = await import('gsap/ScrollTrigger');
      gsap.registerPlugin(ScrollTrigger);

      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReducedMotion || !bgRef.current) return;

      ctx = gsap.context(() => {
        gsap.to(bgRef.current!, {
          yPercent: -18,
          ease: 'none',
          scrollTrigger: {
            trigger: document.body,
            start: 'top top',
            end: 'bottom bottom',
            scrub: true,
          },
        });
      });
    }

    void initParallax();
    return () => ctx?.revert();
  }, [isLoading]);

  const hotspots: LookbookHotspotData[] = products.slice(0, 4).map((product, index) => ({
    id: `hotspot-${index}`,
    x: HOTSPOT_POSITIONS[index]?.x ?? 50,
    y: HOTSPOT_POSITIONS[index]?.y ?? 50,
    product,
  }));

  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--color-brand-charcoal)' }}
      >
        <NarrativeLoader isLoading={true} />
        {/* Dark elegant spinner */}
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: '1px solid rgba(196,154,138,0.3)',
              borderTopColor: 'var(--color-brand-mauve)',
              margin: '0 auto 16px',
              animation: 'spin 1s linear infinite',
            }}
          />
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // If lookbook is disabled
  if (designConfig && !designConfig.isLookbookActive) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
        style={{ backgroundColor: 'var(--color-brand-blush)' }}
      >
        <Link href="/" className="absolute top-6 left-6" style={{ color: 'var(--color-brand-charcoal)', opacity: 0.6, fontFamily: 'var(--font-body)', fontSize: '0.8rem' }}>
          ← Back
        </Link>
        <p className="text-xs uppercase tracking-widest mb-5" style={{ color: 'var(--color-brand-mauve)' }}>
          Minaara Creation
        </p>
        <h1
          className="text-5xl md:text-7xl mb-6"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--color-brand-charcoal)', fontWeight: 300, fontStyle: 'italic' }}
        >
          Coming Soon
        </h1>
        <p style={{ color: 'var(--color-brand-charcoal)', opacity: 0.55, maxWidth: '32rem', fontFamily: 'var(--font-body)', lineHeight: 1.7 }}>
          Our lookbook is being curated with care. Check back soon for an intimate glimpse into the world of Minaara.
        </p>
        <Link
          href="/"
          className="mt-8 px-8 py-3 text-xs uppercase tracking-widest rounded-md"
          style={{ backgroundColor: 'var(--color-brand-mauve)', color: 'white', fontFamily: 'var(--font-body)' }}
          id="lookbook-back-to-collection"
        >
          Explore Collection
        </Link>
      </div>
    );
  }

  const bgImageUrl = designConfig?.heroBanners?.[1]?.url ?? designConfig?.heroBanners?.[0]?.url;

  return (
    <main
      className="relative min-h-screen overflow-hidden"
      style={{ backgroundColor: 'var(--color-brand-charcoal)' }}
    >
      {/* Typewriter Blinds — fires on page mount */}
      <BlindReveal onComplete={() => setBlindDone(true)} />

      {/* Scrolling Ticker Announcement Bar */}
      <div className="w-full bg-[#121212] py-2 text-white overflow-hidden select-none border-b border-brand-mist/5 relative z-50">
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

      {/* ── Navigation ── */}
      <nav
        className="sticky top-0 left-0 right-0 z-45 flex items-center justify-between px-6 md:px-12 py-4"
        style={{
          backgroundColor: 'rgba(26, 26, 26, 0.8)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        {/* Left Side Links */}
        <div className="flex items-center gap-8 w-1/3 justify-start">
          <MagneticLink as="div">
            <Link
              href="/"
              className="text-[10px] uppercase tracking-[0.15em] transition-opacity hover:opacity-100"
              style={{ color: 'white', opacity: 0.65, fontFamily: 'var(--font-body)', fontWeight: 500 }}
            >
              Collection
            </Link>
          </MagneticLink>
          <MagneticLink as="div">
            <Link
              href="/lookbook"
              className="text-[10px] uppercase tracking-[0.15em] transition-opacity hover:opacity-100"
              style={{ color: 'white', opacity: 0.65, fontFamily: 'var(--font-body)', fontWeight: 500 }}
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
                color: 'white',
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
          <MagneticLink as="div">
            <Link
              href="/cart"
              className="relative text-[10px] uppercase tracking-[0.15em] transition-opacity hover:opacity-100 flex items-center gap-2"
              style={{ color: 'white', opacity: 0.65, fontFamily: 'var(--font-body)', fontWeight: 500 }}
              id="nav-cart-link"
            >
              Cart
            </Link>
          </MagneticLink>
        </div>
      </nav>

      {/* Parallax Background */}
      <div
        ref={bgRef}
        className="fixed inset-0 -z-0"
        style={{
          background: bgImageUrl
            ? undefined
            : 'linear-gradient(160deg, #1E1612 0%, #2C2218 40%, #3D2B1F 70%, #2C2C2C 100%)',
        }}
      >
        {bgImageUrl && (
          <Image
            src={bgImageUrl}
            alt="Lookbook background"
            fill
            className="object-cover object-center"
            priority
            sizes="100vw"
          />
        )}
        {/* Multi-layer dark overlay */}
        <div className="absolute inset-0" style={{ background: 'rgba(30, 18, 10, 0.5)' }} />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, transparent 30%, rgba(0,0,0,0.4) 100%)' }}
        />
      </div>

      {/* Lookbook Content */}
      <div className="relative z-10 min-h-screen">
        {/* Hero Text */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: blindDone ? 1 : 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="flex flex-col items-center justify-center min-h-screen px-6 text-center pt-20"
        >
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: blindDone ? 1 : 0, y: blindDone ? 0 : 16 }}
            transition={{ delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="text-xs uppercase tracking-widest mb-5"
            style={{ color: 'var(--color-brand-mauve)' }}
          >
            SS 2025
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: blindDone ? 1 : 0, y: blindDone ? 0 : 40 }}
            transition={{ delay: 0.45, ease: [0.22, 1, 0.36, 1], duration: 0.9 }}
            className="text-6xl md:text-8xl lg:text-9xl leading-none mb-6"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'white',
              fontWeight: 300,
              fontStyle: 'italic',
              letterSpacing: '-0.02em',
            }}
          >
            The Lookbook
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: blindDone ? 1 : 0 }}
            transition={{ delay: 0.7, duration: 0.8 }}
            className="max-w-sm text-sm leading-relaxed mb-10"
            style={{ color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-body)' }}
          >
            Click the pulsing dots to discover the pieces worn in each scene.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: blindDone ? 1 : 0, y: blindDone ? 0 : 8 }}
            transition={{ delay: 0.9, duration: 0.6 }}
            className="flex flex-col items-center gap-2"
          >
            <p
              className="text-xs uppercase tracking-widest"
              style={{ color: 'rgba(255,255,255,0.35)' }}
            >
              Scroll to explore
            </p>
            <div
              style={{
                width: '1px',
                height: '40px',
                background: 'linear-gradient(to bottom, transparent, rgba(196,154,138,0.7))',
                animation: 'lookbook-scroll 2s ease-in-out infinite',
              }}
            />
          </motion.div>
        </motion.div>

        {/* Hotspot Scene */}
        <div className="relative min-h-screen">
          {hotspots.map((hotspot) => (
            <LookbookHotspot key={hotspot.id} data={hotspot} />
          ))}

          {/* Scene Caption */}
          <div className="absolute bottom-12 left-6 md:left-12" style={{ maxWidth: '28rem' }}>
            <div
              style={{
                width: '100%',
                height: '1px',
                background: 'linear-gradient(90deg, var(--color-brand-mauve), transparent)',
                marginBottom: '1.25rem',
              }}
            />
            <p
              className="text-xs uppercase tracking-widest mb-3"
              style={{ color: 'var(--color-brand-mauve)' }}
            >
              Campaign · SS 2025
            </p>
            <p
              className="text-2xl md:text-3xl ink-bleed"
              style={{ fontFamily: 'var(--font-display)', color: 'white', fontWeight: 300, fontStyle: 'italic' }}
            >
              The Art of Quiet Elegance
            </p>
          </div>
        </div>

        {/* Editorial strip — between hotspot and CTA */}
        <div
          className="relative px-6 md:px-14 py-20"
          style={{
            background: 'linear-gradient(to right, rgba(30,18,10,0.9) 0%, rgba(44,30,22,0.6) 100%)',
            borderTop: '1px solid rgba(196,154,138,0.15)',
            borderBottom: '1px solid rgba(196,154,138,0.15)',
          }}
        >
          <div className="max-w-2xl mx-auto text-center">
            <p
              className="text-xs uppercase tracking-widest mb-4"
              style={{ color: 'var(--color-brand-mauve)' }}
            >
              Crafted with intention
            </p>
            <p
              className="text-2xl md:text-3xl ink-bleed"
              style={{
                fontFamily: 'var(--font-display)',
                color: 'rgba(250,247,244,0.88)',
                fontWeight: 300,
                fontStyle: 'italic',
                lineHeight: 1.5,
              }}
            >
              Each piece tells a story of artisans, traditions,<br />and the women who wear them.
            </p>
          </div>
        </div>

        {/* Footer CTA */}
        <div className="relative z-10 flex flex-col items-center justify-center py-24 px-6 text-center">
          <p className="text-xs uppercase tracking-widest mb-4" style={{ color: 'var(--color-brand-mauve)' }}>
            Make it yours
          </p>
          <h2
            className="text-4xl md:text-5xl mb-8 ink-bleed"
            style={{ fontFamily: 'var(--font-display)', color: 'white', fontWeight: 300, fontStyle: 'italic' }}
          >
            Own the look
          </h2>
          <Link
            href="/"
            className="px-10 py-3.5 text-xs uppercase tracking-widest rounded-md transition-all duration-300 hover:opacity-90"
            style={{
              backgroundColor: 'var(--color-brand-mauve)',
              color: 'white',
              fontFamily: 'var(--font-body)',
            }}
            id="lookbook-shop-cta"
          >
            Shop the Collection
          </Link>
        </div>

        {/* Footer */}
        <footer
          className="relative px-6 md:px-14 py-8"
          style={{ borderTop: '1px solid rgba(196,154,138,0.15)' }}
        >
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <Link
              href="/"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.1rem',
                color: 'rgba(255,255,255,0.6)',
                fontStyle: 'italic',
              }}
            >
              Minaara Creation
            </Link>
            <p
              className="text-xs"
              style={{ color: 'rgba(255,255,255,0.25)', fontFamily: 'var(--font-body)' }}
            >
              © {new Date().getFullYear()} Minaara Creation · All rights reserved
            </p>
          </div>
        </footer>
      </div>

      <style>{`
        @keyframes lookbook-scroll {
          0%, 100% { opacity: 0.3; transform: scaleY(1); }
          50% { opacity: 0.9; transform: scaleY(1.2); }
        }
      `}</style>
    </main>
  );
}
