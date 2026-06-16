'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { gsap } from 'gsap';

export function NarrativeLoader({ isLoading }: { isLoading: boolean }) {
  const [shouldRender, setShouldRender] = useState(true);
  const [minTimePassed, setMinTimePassed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const percentRef = useRef<HTMLDivElement>(null);
  const progressObj = useRef({ val: 0 });

  useEffect(() => {
    // Initial logo reveal
    gsap.fromTo(logoRef.current, 
      { opacity: 0, scale: 0.9, y: 20 }, 
      { opacity: 1, scale: 1, y: 0, duration: 1.5, ease: 'power3.out', delay: 0.2 }
    );

    // Minimum display time of 2.5 seconds
    const timer = setTimeout(() => {
      setMinTimePassed(true);
    }, 2500);

    // Smoothly crawl up to 99% using an expo.out curve
    gsap.to(progressObj.current, {
      val: 99,
      duration: 3, // Adjusted to match the 2.5-3s window better
      ease: 'power2.inOut',
      onUpdate: () => {
        if (percentRef.current) percentRef.current.innerText = Math.floor(progressObj.current.val) + '%';
      }
    });

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Only dismiss if both loading is done AND the minimum time has passed
    if (!isLoading && minTimePassed) {
      gsap.to(progressObj.current, {
        val: 100,
        duration: 0.4,
        ease: 'power2.out',
        onUpdate: () => {
          if (percentRef.current) percentRef.current.innerText = Math.floor(progressObj.current.val) + '%';
        },
        onComplete: () => {
          const tl = gsap.timeline({ onComplete: () => setShouldRender(false) });
          tl.to([logoRef.current, textRef.current], { opacity: 0, y: -30, duration: 0.4, ease: 'power2.inOut', stagger: 0.1 })
            .to(containerRef.current, { yPercent: -100, duration: 1.2, ease: 'expo.inOut' }, '-=0.1');
        }
      });
    }
  }, [isLoading, minTimePassed]);

  if (!shouldRender) return null;

  return (
    <div ref={containerRef} style={{ position: 'fixed', inset: 0, zIndex: 99999, backgroundColor: 'var(--color-brand-ivory)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-brand-charcoal)' }}>
      <div ref={logoRef} style={{ opacity: 0, marginBottom: '24px' }}>
        <Image 
          src="/minaara-logo.jpeg" 
          alt="Minaara Logo" 
          width={180} 
          height={180} 
          style={{ objectFit: 'contain' }} 
          priority 
        />
      </div>
      <div ref={textRef} style={{ textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.5rem, 4vw, 4rem)', fontWeight: 300, letterSpacing: '0.04em', margin: '0 0 12px', color: 'var(--color-brand-charcoal)' }}>Minaara</h1>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.3em', opacity: 0.7, margin: 0 }}>Dressed in Grace</p>
        <div ref={percentRef} style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', marginTop: '40px', color: 'var(--color-brand-mauve)' }}>0%</div>
      </div>
    </div>
  );
}
