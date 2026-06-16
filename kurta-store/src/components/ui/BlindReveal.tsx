'use client';

import React, { useEffect, useRef } from 'react';

const SLICE_COUNT = 12;

interface BlindRevealProps {
  /** Fires as soon as the component mounts */
  onComplete?: () => void;
}

/**
 * BlindReveal — Animation 2: Typewriter Blinds
 * 12 horizontal slices each flip open top-to-bottom with a staggered
 * clip-path + rotateX reveal, like Venetian blinds opening.
 */
export function BlindReveal({ onComplete }: BlindRevealProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const slices = container.querySelectorAll<HTMLElement>('.blind-slice');

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      container.style.display = 'none';
      onComplete?.();
      return;
    }

    async function animate() {
      const { gsap } = await import('gsap');

      // Set initial state — slices cover the screen
      gsap.set(slices, {
        scaleY: 1,
        transformOrigin: 'top center',
        clipPath: 'inset(0 0 0% 0)',
      });

      // Staggered flip-open downward
      await gsap.to(slices, {
        scaleY: 0,
        clipPath: 'inset(0 0 100% 0)',
        duration: 0.55,
        ease: 'power3.inOut',
        stagger: {
          each: 0.06,
          from: 'start',
        },
      });

      // Hide the container entirely after animation
      if (containerRef.current) {
        containerRef.current.style.display = 'none';
      }
      onComplete?.();
    }

    void animate();
  }, [onComplete]);

  return (
    <div ref={containerRef} className="blind-container" aria-hidden="true">
      {Array.from({ length: SLICE_COUNT }).map((_, i) => (
        <div
          key={i}
          className="blind-slice"
          style={{
            // Alternate between charcoal tones for depth
            backgroundColor: i % 2 === 0 ? '#2C2C2C' : '#1E1E1E',
          }}
        />
      ))}
    </div>
  );
}
