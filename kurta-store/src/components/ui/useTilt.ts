'use client';

import { useRef, useCallback } from 'react';

/**
 * useTilt — Animation 6: Prism Tilt Hover
 * Returns event handlers for a card element that drives rotateX/rotateY
 * based on mouse position within the card bounds using GSAP quickTo.
 */
export function useTilt(maxRotation = 12) {
  const cardRef = useRef<HTMLElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quickX = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quickY = useRef<any>(null);
  const glareRef = useRef<HTMLDivElement | null>(null);

  const initQuickTo = useCallback(async (el: HTMLElement) => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const { gsap } = await import('gsap');
    quickX.current = gsap.quickTo(el, 'rotateY', { duration: 0.4, ease: 'power2.out' });
    quickY.current = gsap.quickTo(el, 'rotateX', { duration: 0.4, ease: 'power2.out' });
  }, []);

  const onMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const el = e.currentTarget;
      cardRef.current = el;
      void initQuickTo(el);
    },
    [initQuickTo],
  );

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width / 2);  // -1 to +1
    const dy = (e.clientY - cy) / (rect.height / 2); // -1 to +1

    if (quickX.current) quickX.current(dx * maxRotation);
    if (quickY.current) quickY.current(-dy * maxRotation);

    // Move glare
    if (glareRef.current) {
      const glareX = ((e.clientX - rect.left) / rect.width) * 100;
      const glareY = ((e.clientY - rect.top) / rect.height) * 100;
      glareRef.current.style.background = `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.2) 0%, transparent 65%)`;
    }
  }, [maxRotation]);

  const onMouseLeave = useCallback(async () => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const el = cardRef.current;
    if (!el) return;

    const { gsap } = await import('gsap');
    gsap.to(el, {
      rotateX: 0,
      rotateY: 0,
      duration: 0.6,
      ease: 'elastic.out(1, 0.5)',
    });

    if (glareRef.current) {
      glareRef.current.style.background =
        'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.18) 0%, transparent 70%)';
    }
  }, []);

  return { onMouseEnter, onMouseMove, onMouseLeave, glareRef };
}
