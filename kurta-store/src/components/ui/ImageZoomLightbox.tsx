'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useMotionValueEvent,
  animate,
  type PanInfo,
  type TapInfo,
} from 'framer-motion';
import { localResize } from '@/lib/media';

interface ImageZoomLightboxProps {
  images: string[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onIndexChange?: (index: number) => void;
  altBase: string;
}

const ZOOM_LEVEL = 2.5;
const MAX_ZOOM = 4;
const TAP_ZOOMED_THRESHOLD = 1.02;

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const navButtonStyle: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  width: '44px',
  height: '44px',
  borderRadius: '50%',
  border: 'none',
  backgroundColor: 'rgba(250,248,245,0.85)',
  color: 'var(--color-brand-charcoal)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '20px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
  zIndex: 5,
};

function touchDistance(a: React.Touch, b: React.Touch): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

export function ImageZoomLightbox({ images, initialIndex, isOpen, onClose, onIndexChange, altBase }: ImageZoomLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const [isZoomed, setIsZoomed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pinchState = useRef<{ initialDistance: number; initialScale: number } | null>(null);

  const scale = useMotionValue(1);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  useMotionValueEvent(scale, 'change', (v) => setIsZoomed(v > TAP_ZOOMED_THRESHOLD));

  useEffect(() => {
    if (!isOpen) return;
    setIndex(initialIndex);
    scale.set(1);
    x.set(0);
    y.set(0);
    // Only re-sync when the lightbox transitions open / the caller changes the starting image.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialIndex]);

  const resetZoom = useCallback(() => {
    animate(scale, 1, { duration: 0.25 });
    animate(x, 0, { duration: 0.25 });
    animate(y, 0, { duration: 0.25 });
  }, [scale, x, y]);

  const goTo = useCallback(
    (newIndex: number) => {
      setIndex(newIndex);
      onIndexChange?.(newIndex);
      scale.set(1);
      x.set(0);
      y.set(0);
    },
    [onIndexChange, scale, x, y],
  );

  const next = useCallback(() => goTo((index + 1) % images.length), [goTo, index, images.length]);
  const prev = useCallback(() => goTo((index - 1 + images.length) % images.length), [goTo, index, images.length]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, next, prev]);

  const handleTap = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: TapInfo) => {
      const container = containerRef.current;
      if (!container) return;

      if (scale.get() > TAP_ZOOMED_THRESHOLD) {
        resetZoom();
        return;
      }

      const rect = container.getBoundingClientRect();
      const fractionX = (info.point.x - rect.left) / rect.width;
      const fractionY = (info.point.y - rect.top) / rect.height;
      const targetX = (0.5 - fractionX) * rect.width * (ZOOM_LEVEL - 1);
      const targetY = (0.5 - fractionY) * rect.height * (ZOOM_LEVEL - 1);

      animate(scale, ZOOM_LEVEL, { duration: 0.3 });
      animate(x, targetX, { duration: 0.3 });
      animate(y, targetY, { duration: 0.3 });
    },
    [scale, x, y, resetZoom],
  );

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinchState.current = {
        initialDistance: touchDistance(e.touches[0], e.touches[1]),
        initialScale: scale.get(),
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchState.current) {
      e.preventDefault();
      const distance = touchDistance(e.touches[0], e.touches[1]);
      const ratio = distance / pinchState.current.initialDistance;
      const nextScale = Math.min(MAX_ZOOM, Math.max(1, pinchState.current.initialScale * ratio));
      scale.set(nextScale);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      pinchState.current = null;
      if (scale.get() < 1.05) resetZoom();
    }
  };

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (isZoomed) return;
    if (info.offset.x <= -60) next();
    else if (info.offset.x >= 60) prev();
  };

  if (images.length === 0) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal-overlay"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={`${altBase} — zoomed image viewer`}
        >
          <motion.div
            style={{ position: 'relative', width: 'min(92vw, 1400px)', height: '86vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              aria-label="Close zoomed image"
              style={{
                position: 'absolute',
                top: '-4px',
                right: '0px',
                zIndex: 10,
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                border: 'none',
                backgroundColor: 'rgba(250,248,245,0.9)',
                color: 'var(--color-brand-charcoal)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 2L14 14M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>

            <div
              ref={containerRef}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              style={{ width: '100%', height: '100%', overflow: 'hidden', touchAction: 'none' }}
            >
              <motion.img
                key={index}
                src={localResize(images[index], 2000)}
                alt={`${altBase} — view ${index + 1}`}
                onTap={handleTap}
                drag={isZoomed ? true : images.length > 1 ? 'x' : false}
                dragConstraints={isZoomed ? containerRef : { left: 0, right: 0 }}
                dragElastic={isZoomed ? 0.05 : 0.2}
                onDragEnd={handleDragEnd}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  scale,
                  x,
                  y,
                  cursor: isZoomed ? 'zoom-out' : 'zoom-in',
                }}
                draggable={false}
              />
            </div>

            {images.length > 1 && !isZoomed && (
              <>
                <button onClick={prev} aria-label="Previous image" style={{ ...navButtonStyle, left: '12px' }}>
                  ‹
                </button>
                <button onClick={next} aria-label="Next image" style={{ ...navButtonStyle, right: '12px' }}>
                  ›
                </button>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
