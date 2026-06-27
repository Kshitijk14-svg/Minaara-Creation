'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { LookbookHotspot } from '@/components/ui/LookbookHotspot';
import type { Product, DesignConfig, LookbookHotspotData } from '@/types/schema';

// Distribute up to 3 products per panel across 3 fixed positions
const HOTSPOT_POSITIONS = [
  { x: 28, y: 38 },
  { x: 62, y: 55 },
  { x: 74, y: 32 },
];

const LOOKBOOK_IMAGES = [
  '/lookbook-banner.webp',
  '/lookbook-outdoor.webp',
  '/lookbook-hotspot.webp',
];

interface Props {
  products: Product[];
  config: DesignConfig | null;
}

export default function LookbookClient({ products, config }: Props) {
  const panels = LOOKBOOK_IMAGES.map((img, panelIdx) => ({
    image: img,
    hotspots: products
      .slice(panelIdx * 3, panelIdx * 3 + 3)
      .map((product, i): LookbookHotspotData => ({
        id: `panel-${panelIdx}-spot-${i}`,
        x:  HOTSPOT_POSITIONS[i].x,
        y:  HOTSPOT_POSITIONS[i].y,
        product,
      })),
  }));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let ctx: { revert: () => void } | null = null;
    (async () => {
      const { gsap }         = await import('gsap');
      const { ScrollTrigger } = await import('gsap/ScrollTrigger');
      gsap.registerPlugin(ScrollTrigger);

      ctx = gsap.context(() => {
        // Parallax on each panel image
        document.querySelectorAll('.lookbook-panel').forEach((panel) => {
          const img = panel.querySelector('img');
          if (img) {
            gsap.to(img, {
              yPercent: -12, ease: 'none',
              scrollTrigger: { trigger: panel, start: 'top bottom', end: 'bottom top', scrub: true },
            });
          }
        });

        // Heading reveal
        document.querySelectorAll('.lookbook-heading').forEach((el) => {
          gsap.fromTo(el,
            { clipPath: 'inset(0 100% 0 0)', opacity: 0 },
            { clipPath: 'inset(0 0% 0 0)', opacity: 1, duration: 1.1, ease: 'power3.out',
              scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none none' } }
          );
        });
      });
    })();

    return () => ctx?.revert();
  }, []);

  return (
    <main style={{ backgroundColor: '#0A0A0A', color: '#FAF8F5', minHeight: '100vh' }}>

      {/* Hero */}
      <section style={{ position: 'relative', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <Image src="/lookbook-banner.webp" alt="Minaara Lookbook" fill priority style={{ objectFit: 'cover', objectPosition: 'center' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.55) 100%)' }} />
        </div>
        <div style={{ position: 'relative', zIndex: 10, textAlign: 'center', padding: '0 24px' }}>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            style={{ fontFamily: 'var(--font-body)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.3em', color: 'rgba(244,236,225,0.7)', marginBottom: '20px' }}
          >
            Minaara Creation &nbsp;·&nbsp; 2025
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 1, ease: [0.22, 1, 0.36, 1] }}
            style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(3.5rem, 8vw, 7rem)', fontWeight: 300, color: '#ffffff', lineHeight: 1, margin: '0 0 28px' }}
          >
            The Lookbook
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.85, duration: 0.8 }}
            style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'rgba(255,255,255,0.65)', maxWidth: '480px', margin: '0 auto 32px', lineHeight: 1.8 }}
          >
            Handcrafted Indian womenswear, photographed in the light it deserves.
            Tap the dots to discover each piece.
          </motion.p>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1, duration: 0.6 }}
          >
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.4)' }}>
              ↓ Scroll to explore
            </span>
          </motion.div>
        </div>
      </section>

      {/* Lookbook Panels */}
      {panels.map((panel, i) => (
        <section
          key={i}
          className="lookbook-panel"
          style={{ position: 'relative', height: '100vh', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div style={{ position: 'absolute', inset: 0 }}>
            <Image
              src={panel.image}
              alt={`Minaara Lookbook — Scene ${i + 1}`}
              fill
              style={{ objectFit: 'cover', objectPosition: 'center' }}
              sizes="100vw"
            />
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.15)' }} />
          </div>

          {/* Hotspots */}
          {panel.hotspots.map((hotspot) => (
            <LookbookHotspot key={hotspot.id} data={hotspot} />
          ))}

          {/* Panel index */}
          <div style={{ position: 'absolute', bottom: '40px', right: '40px', zIndex: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}>
              0{i + 1} / 0{panels.length}
            </span>
          </div>
        </section>
      ))}

      {/* Editorial Footer */}
      <section style={{ padding: '80px 24px', textAlign: 'center', backgroundColor: '#0A0A0A' }}>
        <p className="lookbook-heading" style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 5vw, 4rem)', fontWeight: 300, color: '#FAF8F5', lineHeight: 1.15, maxWidth: '700px', margin: '0 auto 32px' }}>
          Discover every piece from the collection
        </p>
        <Link
          href="/collection"
          style={{ display: 'inline-block', padding: '16px 40px', border: '1px solid rgba(250,248,245,0.35)', borderRadius: '4px', color: '#FAF8F5', textDecoration: 'none', fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em', transition: 'background-color 0.3s, border-color 0.3s' }}
        >
          Shop the Collection
        </Link>
      </section>
    </main>
  );
}
