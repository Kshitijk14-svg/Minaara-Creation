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
  const hasAnimatedOut = useRef(false);

  useEffect(() => {
    // Initial logo reveal
    gsap.fromTo(logoRef.current,
      { opacity: 0, scale: 0.92, y: 16 },
      { opacity: 1, scale: 1, y: 0, duration: 0.9, ease: 'power3.out', delay: 0.1 }
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
      tl.to(logoRef.current, { opacity: 0, y: -20, duration: 0.35, ease: 'power2.in' })
        .to(containerRef.current, { yPercent: -100, duration: 0.9, ease: 'expo.inOut' }, '-=0.1');
    }
  }, [isLoading]);

  return (
    <div ref={containerRef} style={{ position: 'fixed', inset: 0, zIndex: 99999, backgroundColor: '#EDE6DE', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div ref={logoRef} style={{ opacity: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/minaara-logo.jpeg" alt="Minara" width={160} height={160} style={{ objectFit: 'contain', display: 'block' }} />
      </div>
    </div>
  );
}
