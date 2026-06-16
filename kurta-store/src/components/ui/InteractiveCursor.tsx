'use client';

import React, { useEffect, useRef, useState } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  maxRadius: number;
  color: string;
  alpha: number;
  decay: number;
}

const BRAND_COLORS = [
  'rgba(140, 111, 99, 0.5)',  // brand-mauve (#8C6F63)
  'rgba(166, 128, 38, 0.45)', // brand-gold (#A68026)
  'rgba(229, 218, 201, 0.6)', // brand-blush-deep (#E5DAC9)
  'rgba(26, 26, 26, 0.25)',   // brand-charcoal (#1A1A1A)
];

const BRAND_GOLD = 'rgba(166, 128, 38, 0.8)';

export function InteractiveCursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0, lastX: 0, lastY: 0, speed: 0 });
  const particlesRef = useRef<Particle[]>([]);
  const isHoveredRef = useRef(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (isMobile || prefersReducedMotion) return;

    const timeoutId = setTimeout(() => {
      setIsVisible(true);
    }, 0);

    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set full-screen size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Track mouse coordinates & speed
    const handleMouseMove = (e: MouseEvent) => {
      const mouse = mouseRef.current;
      mouse.x = e.clientX;
      mouse.y = e.clientY;

      const dx = mouse.x - mouse.lastX;
      const dy = mouse.y - mouse.lastY;
      mouse.speed = Math.sqrt(dx * dx + dy * dy);

      // Spawn particles based on speed
      const spawnCount = Math.min(Math.floor(mouse.speed / 4) + 1, 6);
      for (let i = 0; i < spawnCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speedMultiplier = Math.random() * 1.5 + 0.2;
        const driftX = Math.cos(angle) * speedMultiplier;
        const driftY = Math.sin(angle) * speedMultiplier;

        // Choose random brand color or gold if hovering
        const color = isHoveredRef.current
          ? BRAND_GOLD
          : BRAND_COLORS[Math.floor(Math.random() * BRAND_COLORS.length)]!;

        const baseRadius = isHoveredRef.current ? Math.random() * 24 + 12 : Math.random() * 16 + 8;

        particlesRef.current.push({
          x: mouse.x,
          y: mouse.y,
          vx: driftX + dx * 0.05,
          vy: driftY + dy * 0.05,
          radius: baseRadius,
          maxRadius: baseRadius,
          color,
          alpha: 1.0,
          decay: Math.random() * 0.02 + 0.015,
        });
      }

      mouse.lastX = mouse.x;
      mouse.lastY = mouse.y;
    };

    // Track hover over interactive links & buttons
    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isInteractive =
        target.tagName === 'A' ||
        target.tagName === 'BUTTON' ||
        target.closest('button') ||
        target.closest('a') ||
        target.classList.contains('product-card') ||
        target.closest('.product-card');

      isHoveredRef.current = !!isInteractive;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseover', handleMouseOver);

    // Animation Loop
    let animationFrameId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]!;
        
        // Update physics
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.98; // Friction
        p.vy *= 0.98;
        
        // Decay and shrink
        p.alpha -= p.decay;
        p.radius = p.maxRadius * p.alpha;

        if (p.alpha <= 0.01 || p.radius <= 0.5) {
          particles.splice(i, 1);
          continue;
        }

        // Draw particle
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      }

      // Draw custom leading cursor dot
      const mouse = mouseRef.current;
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, isHoveredRef.current ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = isHoveredRef.current ? 'rgba(166, 128, 38, 0.95)' : 'rgba(26, 26, 26, 0.85)';
      ctx.fill();

      animationFrameId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseover', handleMouseOver);
      cancelAnimationFrame(animationFrameId);
    };
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <>
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 z-100"
        style={{
          mixBlendMode: 'multiply',
          filter: 'url(#liquid-ink-bleed-filter)',
        }}
      />
      {/* SVG liquid distortion (metaball) filter element */}
      <svg className="hidden" aria-hidden="true">
        <defs>
          <filter id="liquid-ink-bleed-filter">
            <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9"
              result="contrast"
            />
            <feBlend in="SourceGraphic" in2="contrast" />
          </filter>
        </defs>
      </svg>
    </>
  );
}
