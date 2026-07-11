'use client';

import React, { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * PageTransition — Animation 1: Silk Curtain Wipe
 * A blush-pink panel sweeps left→right across the screen on every
 * route change, revealing the new page underneath.
 *
 * Uses GSAP and pathname change detection (App Router compatible).
 */
export function PageTransition() {
  const curtainRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const curtain = curtainRef.current;
    if (!curtain) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    async function animate() {
      const { gsap } = await import('gsap');

      // Entry sweep: slide in from left edge to full cover
      await gsap.fromTo(
        curtain,
        { clipPath: 'inset(0 100% 0 0)', opacity: 1 },
        {
          clipPath: 'inset(0 0% 0 0)',
          duration: 0.55,
          ease: 'power3.inOut',
        },
      );

      // Exit sweep: slide out to right edge
      await gsap.to(curtain, {
        clipPath: 'inset(0 0% 0 100%)',
        duration: 0.55,
        ease: 'power3.inOut',
        delay: 0.05,
      });

      // Reset
      gsap.set(curtain, { clipPath: 'inset(0 100% 0 0)', opacity: 1 });
    }

    void animate();

    // Recalculate ScrollTrigger sizes/offsets as soon as the new route's DOM
    // has painted — independent of the curtain animation's own ~1.15s duration
    // above, so this can't land ~1s late, after the user has already scrolled
    // into a pinned section on the new page.
    (async () => {
      const { ScrollTrigger } = await import('gsap/ScrollTrigger');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          ScrollTrigger.refresh();
        });
      });
    })();
  }, [pathname]);

  return (
    <div
      ref={curtainRef}
      className="silk-curtain"
      aria-hidden="true"
      style={{ clipPath: 'inset(0 100% 0 0)' }}
    />
  );
}
