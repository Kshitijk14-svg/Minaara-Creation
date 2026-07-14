'use client';

import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

/**
 * NarrativeLoader — Brand splash screen shown once on first page load.
 * Shows until isLoading is false. Minimum display time is now just 800ms
 * to avoid blocking the user unnecessarily.
 */
export function NarrativeLoader({ isLoading }: { isLoading: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const hasAnimatedOut = useRef(false);

  useEffect(() => {
    // Initial logo reveal
    gsap.fromTo(logoRef.current,
      { opacity: 0, scale: 0.92, y: 16 },
      { opacity: 1, scale: 1, y: 0, duration: 0.9, ease: 'power3.out', delay: 0.1 }
    );
    gsap.fromTo(textRef.current,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', delay: 0.4 }
    );
  }, []);

  useEffect(() => {
    if (!isLoading && !hasAnimatedOut.current) {
      hasAnimatedOut.current = true;
      const tl = gsap.timeline({
        onComplete: () => {
          if (containerRef.current) containerRef.current.style.display = 'none';
        }
      });
      tl.to([logoRef.current, textRef.current], { opacity: 0, y: -20, duration: 0.35, ease: 'power2.in', stagger: 0.05 })
        .to(containerRef.current, { yPercent: -100, duration: 0.9, ease: 'expo.inOut' }, '-=0.1');
    }
  }, [isLoading]);

  return (
    <div ref={containerRef} style={{ position: 'fixed', inset: 0, zIndex: 99999, backgroundColor: '#EDE6DE', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div ref={logoRef} style={{ opacity: 0, marginBottom: '24px' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/minaara-logo.jpeg" alt="Minara" width={160} height={160} style={{ objectFit: 'contain', display: 'block' }} />
      </div>
      <div ref={textRef} style={{ textAlign: 'center', opacity: 0 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.5rem, 4vw, 4rem)', fontWeight: 300, letterSpacing: '0.04em', margin: '0 0 12px', color: 'var(--color-brand-charcoal)' }}>Minara</h1>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.3em', opacity: 0.7, margin: 0, color: 'var(--color-brand-charcoal)' }}>Dressed in Grace</p>
      </div>
    </div>
  );
}
