'use client';

import { useEffect } from 'react';

/**
 * useInkBleed — Performance-optimized version
 * Uses IntersectionObserver + CSS classes instead of GSAP per-element.
 * The CSS transition is handled in globals.css (.ink-bleed / .ink-bleed.is-revealed)
 */
export function useInkBleed(containerSelector = '.ink-bleed') {
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const elements = document.querySelectorAll<HTMLElement>(containerSelector);

    if (prefersReducedMotion) {
      elements.forEach((el) => el.classList.add('is-revealed'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [containerSelector]);
}
