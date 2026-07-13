'use client';

import { useEffect, type RefObject, type MutableRefObject } from 'react';

interface Stat { value: number; suffix: string; label: string; }

export interface MobileScrollFXRefs {
  statsRef: RefObject<HTMLElement | null>;
  statsValueRefs: MutableRefObject<(HTMLDivElement | null)[]>;
}

const REVEAL_SELECTOR = '.scroll-heading, .fade-up, .edit-card, .slide-left, .section-divider';

function animateCounter(el: HTMLDivElement, target: number, suffix: string) {
  const duration = 1400;
  const start = performance.now();
  const tick = (now: number) => {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.innerText = Math.round(target * eased) + suffix;
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// Lightweight mobile substitute for useDesktopScrollFX — no GSAP/ScrollTrigger
// import at all. A single IntersectionObserver drives one-shot CSS fades
// (see [data-mobile-fx] rules in globals.css) instead of continuous scroll
// scrubbing, and the pinned horizontal-scroll hijack is dropped entirely —
// those sections already fall back to plain native horizontal scroll below
// 1024px via the existing @media rules in HomeClient's own <style> block.
export function useMobileScrollFX(enabled: boolean, refs: MobileScrollFXRefs, stats: Stat[]) {
  useEffect(() => {
    if (!enabled) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    document.documentElement.setAttribute('data-mobile-fx', '1');

    const revealIo = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          revealIo.unobserve(entry.target);
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    );
    document.querySelectorAll(REVEAL_SELECTOR).forEach((el) => revealIo.observe(el));

    let statsIo: IntersectionObserver | null = null;
    if (refs.statsRef.current && stats.length) {
      statsIo = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          stats.forEach((stat, i) => {
            const el = refs.statsValueRefs.current[i];
            if (el) animateCounter(el, stat.value, stat.suffix);
          });
          statsIo?.disconnect();
        },
        { threshold: 0.4 },
      );
      statsIo.observe(refs.statsRef.current);
    }

    return () => {
      document.documentElement.removeAttribute('data-mobile-fx');
      revealIo.disconnect();
      statsIo?.disconnect();
    };
  }, [enabled]);
}
