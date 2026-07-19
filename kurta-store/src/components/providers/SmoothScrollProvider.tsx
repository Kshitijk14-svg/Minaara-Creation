'use client';

import React, { useEffect } from 'react';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// RootLayout (which owns this provider) never remounts across client-side
// navigation, so this Lenis instance is created exactly once per SPA session.
// Exposed at module scope so other client components (e.g. HomeClient's
// scroll-to-top reset) can drive Lenis directly instead of the native scrollTo.
export const lenisInstance: { current: Lenis | null } = { current: null };

export function SmoothScrollProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Check if user prefers reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    // Skip smooth-scroll on touch devices entirely — Lenis's per-frame
    // rAF/lerp loop is the single biggest source of scroll jank on phone/
    // tablet CPUs; native scrolling is both cheaper and what touch users
    // expect anyway. `pointer: coarse` catches tablets too, not just narrow
    // phone viewports.
    const isTouchDevice = window.matchMedia('(pointer: coarse), (max-width: 767px)').matches;
    if (isTouchDevice) return;

    gsap.registerPlugin(ScrollTrigger);

    const lenis = new Lenis({
      duration: 1.4,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // easeOutExpo style
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
    });
    lenisInstance.current = lenis;

    // Unify the rAF loop with GSAP ticker to prevent layout thrashing and boost FPS
    const updateLenis = (time: number) => {
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(updateLenis);
    // GSAP defaults: absorb brief startup/main-thread hiccups instead of letting
    // an uncapped time delta hit Lenis + scrub animations (causes a frozen-then-snap scroll).
    gsap.ticker.lagSmoothing(500, 33);

    // Sync GSAP ScrollTrigger with Lenis. Lenis runs here without wrapper/content,
    // so it smooths the real native scroll position (no scrollerProxy needed —
    // that would switch pins to transform-based positioning and route GSAP's
    // internal scroll reads/writes through lenis.scrollTo()'s eased animation
    // instead of an instant jump, desyncing pin start/end measurements).
    lenis.on('scroll', ScrollTrigger.update);

    // Lenis tracks its own scroll limit (content height - viewport height) via a
    // debounced ResizeObserver, independent of GSAP. On client-side navigation
    // back to a pinned-heavy page, ScrollTrigger.refresh() can resize pin-spacers
    // faster than that debounce fires, leaving Lenis clamping scroll input to a
    // stale, too-short limit (dead zones / stuck pins). Force an immediate resync
    // on every refresh, regardless of which call site triggered it.
    const handleRefresh = () => lenis.resize();
    ScrollTrigger.addEventListener('refresh', handleRefresh);

    // Defer past paint so pin dimensions are measured once HomeClient's own
    // trigger-creation effect has also run.
    let rafId1: number | null = null;
    let rafId2: number | null = null;
    rafId1 = requestAnimationFrame(() => {
      rafId2 = requestAnimationFrame(() => {
        ScrollTrigger.refresh();
      });
    });

    return () => {
      if (rafId1 !== null) cancelAnimationFrame(rafId1);
      if (rafId2 !== null) cancelAnimationFrame(rafId2);
      ScrollTrigger.removeEventListener('refresh', handleRefresh);
      gsap.ticker.remove(updateLenis);
      lenis.destroy();
      ScrollTrigger.getAll().forEach((t) => t.kill());
      lenisInstance.current = null;
    };
  }, []);

  return <>{children}</>;
}
