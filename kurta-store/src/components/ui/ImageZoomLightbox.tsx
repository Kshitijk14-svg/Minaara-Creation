'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
const PAN_CLICK_THRESHOLD = 8;
const TAP_MAX_DURATION_MS = 350;
const SWIPE_THRESHOLD = 60;

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

type Size = { w: number; h: number };
type Point = { x: number; y: number };
type GestureMode = 'pending' | 'pan' | 'pinch' | 'swipe';

interface GestureState {
  mode: GestureMode;
  startX: number;
  startY: number;
  startTime: number;
  startScrollLeft: number;
  startScrollTop: number;
  pinchStartDist?: number;
  pinchStartScale?: number;
  focalFracX?: number;
  focalFracY?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function fitContain(natural: Size, container: Size): Size {
  if (!natural.w || !natural.h || !container.w || !container.h) return { w: container.w, h: container.h };
  const natRatio = natural.w / natural.h;
  const contRatio = container.w / container.h;
  return natRatio > contRatio ? { w: container.w, h: container.w / natRatio } : { h: container.h, w: container.h * natRatio };
}

function computeBox(fit: Size, scale: number, container: Size) {
  const imgW = fit.w * scale;
  const imgH = fit.h * scale;
  const canvasW = Math.max(container.w, imgW);
  const canvasH = Math.max(container.h, imgH);
  return {
    canvasW,
    canvasH,
    imgW,
    imgH,
    imgLeft: (canvasW - imgW) / 2,
    imgTop: (canvasH - imgH) / 2,
  };
}

export function ImageZoomLightbox({ images, initialIndex, isOpen, onClose, onIndexChange, altBase }: ImageZoomLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [isZoomed, setIsZoomed] = useState(false);
  const [containerSize, setContainerSize] = useState<Size>({ w: 0, h: 0 });
  const [fitSize, setFitSize] = useState<Size>({ w: 0, h: 0 });
  const [ready, setReady] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const fitSizeRef = useRef<Size>({ w: 0, h: 0 });
  const scaleRef = useRef(1);
  const pointersRef = useRef<Map<number, Point>>(new Map());
  const gestureRef = useRef<GestureState | null>(null);

  const syncFitSize = useCallback(() => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container || !img.naturalWidth || !img.naturalHeight) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (!cw || !ch) return;
    fitSizeRef.current = fitContain({ w: img.naturalWidth, h: img.naturalHeight }, { w: cw, h: ch });
    setFitSize(fitSizeRef.current);
    setContainerSize({ w: cw, h: ch });
    setReady(true);
  }, []);

  const resetZoomState = useCallback(() => {
    scaleRef.current = 1;
    setScale(1);
    setIsZoomed(false);
    setReady(false);
    pointersRef.current.clear();
    gestureRef.current = null;
    const container = containerRef.current;
    if (container) {
      container.scrollLeft = 0;
      container.scrollTop = 0;
    }
    if (canvasRef.current) {
      canvasRef.current.style.transform = '';
      canvasRef.current.style.transition = '';
      canvasRef.current.style.width = '';
      canvasRef.current.style.height = '';
    }
    if (imgRef.current) {
      imgRef.current.style.transition = '';
      imgRef.current.style.width = '';
      imgRef.current.style.height = '';
      imgRef.current.style.left = '';
      imgRef.current.style.top = '';
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setIndex(initialIndex);
    resetZoomState();
    // Only re-sync when the lightbox transitions open / the caller changes the starting image.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialIndex]);

  useEffect(() => {
    if (!isOpen) return;
    const container = containerRef.current;
    if (!container) return;
    syncFitSize();
    const ro = new ResizeObserver(() => syncFitSize());
    ro.observe(container);
    return () => ro.disconnect();
  }, [isOpen, syncFitSize]);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const el = containerRef.current;
    if (!el) return;
    const prevent = (e: Event) => e.preventDefault();
    el.addEventListener('gesturestart', prevent, { passive: false });
    el.addEventListener('gesturechange', prevent, { passive: false });
    return () => {
      el.removeEventListener('gesturestart', prevent);
      el.removeEventListener('gesturechange', prevent);
    };
  }, [isOpen]);

  const goTo = useCallback(
    (newIndex: number) => {
      setIndex(newIndex);
      onIndexChange?.(newIndex);
      resetZoomState();
    },
    [onIndexChange, resetZoomState],
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

  const commitScale = useCallback(() => {
    setScale(scaleRef.current);
    setIsZoomed(scaleRef.current > TAP_ZOOMED_THRESHOLD);
  }, []);

  const settleScaleIfNearOne = useCallback(() => {
    if (scaleRef.current >= 1.05) return;
    scaleRef.current = 1;
    setScale(1);
    setIsZoomed(false);
    const container = containerRef.current;
    const img = imgRef.current;
    if (container) {
      container.scrollLeft = 0;
      container.scrollTop = 0;
    }
    if (img) {
      img.style.transition = 'width .2s ease, height .2s ease, left .2s ease, top .2s ease';
      window.setTimeout(() => {
        if (imgRef.current) imgRef.current.style.transition = '';
      }, 220);
    }
  }, []);

  const zoomTo = useCallback((targetScale: number, fx: number, fy: number) => {
    const container = containerRef.current;
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!container || !img || !canvas) return;

    const clampedScale = clamp(targetScale, 1, MAX_ZOOM);
    const size: Size = { w: container.clientWidth, h: container.clientHeight };
    const box = computeBox(fitSizeRef.current, clampedScale, size);

    img.style.transition = 'width .3s ease, height .3s ease, left .3s ease, top .3s ease';
    canvas.style.transition = 'width .3s ease, height .3s ease';
    img.style.width = `${box.imgW}px`;
    img.style.height = `${box.imgH}px`;
    img.style.left = `${box.imgLeft}px`;
    img.style.top = `${box.imgTop}px`;
    canvas.style.width = `${box.canvasW}px`;
    canvas.style.height = `${box.canvasH}px`;

    const targetCanvasX = box.imgLeft + fx * box.imgW;
    const targetCanvasY = box.imgTop + fy * box.imgH;
    const maxScrollX = Math.max(0, box.canvasW - size.w);
    const maxScrollY = Math.max(0, box.canvasH - size.h);
    const scrollLeft = clamp(targetCanvasX - size.w / 2, 0, maxScrollX);
    const scrollTop = clamp(targetCanvasY - size.h / 2, 0, maxScrollY);
    container.scrollTo({ left: scrollLeft, top: scrollTop, behavior: 'smooth' });

    scaleRef.current = clampedScale;
    setScale(clampedScale);
    setIsZoomed(clampedScale > TAP_ZOOMED_THRESHOLD);

    window.setTimeout(() => {
      if (imgRef.current) imgRef.current.style.transition = '';
      if (canvasRef.current) canvasRef.current.style.transition = '';
    }, 320);
  }, []);

  const handleTapToggle = useCallback(
    (clientX: number, clientY: number) => {
      const img = imgRef.current;
      if (!img) return;

      if (scaleRef.current > TAP_ZOOMED_THRESHOLD) {
        zoomTo(1, 0.5, 0.5);
        return;
      }

      const rect = img.getBoundingClientRect();
      const fx = rect.width ? clamp((clientX - rect.left) / rect.width, 0, 1) : 0.5;
      const fy = rect.height ? clamp((clientY - rect.top) / rect.height, 0, 1) : 0.5;
      zoomTo(ZOOM_LEVEL, fx, fy);
    },
    [zoomTo],
  );

  const beginPinch = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const pts = Array.from(pointersRef.current.values());
    if (pts.length < 2) return;
    const [p1, p2] = pts;
    const rect = container.getBoundingClientRect();
    const box = computeBox(fitSizeRef.current, scaleRef.current, { w: container.clientWidth, h: container.clientHeight });
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    const canvasX = container.scrollLeft + (midX - rect.left);
    const canvasY = container.scrollTop + (midY - rect.top);

    gestureRef.current = {
      mode: 'pinch',
      startX: midX,
      startY: midY,
      startTime: performance.now(),
      startScrollLeft: container.scrollLeft,
      startScrollTop: container.scrollTop,
      pinchStartDist: dist(p1, p2),
      pinchStartScale: scaleRef.current,
      focalFracX: box.imgW ? clamp((canvasX - box.imgLeft) / box.imgW, 0, 1) : 0.5,
      focalFracY: box.imgH ? clamp((canvasY - box.imgTop) / box.imgH, 0, 1) : 0.5,
    };
  }, []);

  const updatePinch = useCallback(() => {
    const container = containerRef.current;
    const gesture = gestureRef.current;
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!container || !img || !canvas || !gesture || gesture.mode !== 'pinch' || gesture.pinchStartDist == null) return;

    const pts = Array.from(pointersRef.current.values());
    if (pts.length < 2) return;
    const [p1, p2] = pts;
    const ratio = dist(p1, p2) / gesture.pinchStartDist;
    const newScale = clamp((gesture.pinchStartScale ?? 1) * ratio, 1, MAX_ZOOM);
    scaleRef.current = newScale;

    const size: Size = { w: container.clientWidth, h: container.clientHeight };
    const box = computeBox(fitSizeRef.current, newScale, size);
    img.style.width = `${box.imgW}px`;
    img.style.height = `${box.imgH}px`;
    img.style.left = `${box.imgLeft}px`;
    img.style.top = `${box.imgTop}px`;
    canvas.style.width = `${box.canvasW}px`;
    canvas.style.height = `${box.canvasH}px`;

    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    const rect = container.getBoundingClientRect();
    const targetCanvasX = box.imgLeft + (gesture.focalFracX ?? 0.5) * box.imgW;
    const targetCanvasY = box.imgTop + (gesture.focalFracY ?? 0.5) * box.imgH;
    const maxScrollX = Math.max(0, box.canvasW - size.w);
    const maxScrollY = Math.max(0, box.canvasH - size.h);
    container.scrollLeft = clamp(targetCanvasX - (midX - rect.left), 0, maxScrollX);
    container.scrollTop = clamp(targetCanvasY - (midY - rect.top), 0, maxScrollY);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const container = containerRef.current;
      if (!container) return;
      e.preventDefault();
      container.setPointerCapture(e.pointerId);
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointersRef.current.size === 2) {
        beginPinch();
      } else if (pointersRef.current.size === 1) {
        gestureRef.current = {
          mode: 'pending',
          startX: e.clientX,
          startY: e.clientY,
          startTime: performance.now(),
          startScrollLeft: container.scrollLeft,
          startScrollTop: container.scrollTop,
        };
      }
    },
    [beginPinch],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!pointersRef.current.has(e.pointerId)) return;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      const gesture = gestureRef.current;
      const container = containerRef.current;
      if (!gesture || !container) return;

      if (pointersRef.current.size >= 2) {
        if (gesture.mode !== 'pinch') beginPinch();
        updatePinch();
        return;
      }

      if (gesture.mode === 'pending') {
        const dx = e.clientX - gesture.startX;
        const dy = e.clientY - gesture.startY;
        if (Math.hypot(dx, dy) <= PAN_CLICK_THRESHOLD) return;
        if (scaleRef.current > TAP_ZOOMED_THRESHOLD) {
          gesture.mode = 'pan';
        } else if (images.length > 1 && Math.abs(dx) >= Math.abs(dy)) {
          gesture.mode = 'swipe';
        } else {
          gesture.mode = 'pan';
        }
      }

      if (gesture.mode === 'pan') {
        const dx = e.clientX - gesture.startX;
        const dy = e.clientY - gesture.startY;
        const box = computeBox(fitSizeRef.current, scaleRef.current, { w: container.clientWidth, h: container.clientHeight });
        const maxScrollX = Math.max(0, box.canvasW - container.clientWidth);
        const maxScrollY = Math.max(0, box.canvasH - container.clientHeight);
        container.scrollLeft = clamp(gesture.startScrollLeft - dx, 0, maxScrollX);
        container.scrollTop = clamp(gesture.startScrollTop - dy, 0, maxScrollY);
      } else if (gesture.mode === 'swipe') {
        const dx = e.clientX - gesture.startX;
        if (canvasRef.current) canvasRef.current.style.transform = `translateX(${dx * 0.4}px)`;
      }
    },
    [beginPinch, updatePinch, images.length],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const container = containerRef.current;
      const gesture = gestureRef.current;
      pointersRef.current.delete(e.pointerId);
      try {
        container?.releasePointerCapture(e.pointerId);
      } catch {
        // pointer capture already released
      }

      if (!gesture || !container) {
        gestureRef.current = null;
        return;
      }

      if (gesture.mode === 'pinch' && pointersRef.current.size === 1) {
        const remaining = Array.from(pointersRef.current.values())[0];
        commitScale();
        gestureRef.current = {
          mode: 'pan',
          startX: remaining.x,
          startY: remaining.y,
          startTime: performance.now(),
          startScrollLeft: container.scrollLeft,
          startScrollTop: container.scrollTop,
        };
        return;
      }

      if (pointersRef.current.size > 0) return;

      const elapsed = performance.now() - gesture.startTime;

      if (gesture.mode === 'pending') {
        if (elapsed <= TAP_MAX_DURATION_MS) handleTapToggle(e.clientX, e.clientY);
      } else if (gesture.mode === 'pan' || gesture.mode === 'pinch') {
        commitScale();
        settleScaleIfNearOne();
      } else if (gesture.mode === 'swipe') {
        const dx = e.clientX - gesture.startX;
        const canvas = canvasRef.current;
        if (canvas) canvas.style.transition = 'transform 0.2s ease';
        if (Math.abs(dx) >= SWIPE_THRESHOLD) {
          if (dx <= -SWIPE_THRESHOLD) next();
          else prev();
        } else if (canvas) {
          canvas.style.transform = 'translateX(0px)';
        }
        window.setTimeout(() => {
          if (canvasRef.current) {
            canvasRef.current.style.transition = '';
            canvasRef.current.style.transform = '';
          }
        }, 220);
      }

      gestureRef.current = null;
    },
    [commitScale, settleScaleIfNearOne, handleTapToggle, next, prev],
  );

  if (images.length === 0) return null;

  const box = computeBox(fitSize, scale, containerSize);

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
              className="scrollbar-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              style={{
                width: '100%',
                height: '100%',
                overflow: 'auto',
                touchAction: 'none',
                position: 'relative',
                WebkitUserSelect: 'none',
                userSelect: 'none',
                WebkitTouchCallout: 'none',
              }}
            >
              <div
                ref={canvasRef}
                style={{ position: 'relative', width: box.canvasW || '100%', height: box.canvasH || '100%' }}
              >
                <img
                  key={index}
                  ref={imgRef}
                  src={localResize(images[index], 2000)}
                  alt={`${altBase} — view ${index + 1}`}
                  onLoad={syncFitSize}
                  style={{
                    position: 'absolute',
                    left: box.imgLeft || 0,
                    top: box.imgTop || 0,
                    width: box.imgW || '100%',
                    height: box.imgH || '100%',
                    opacity: ready ? 1 : 0,
                    transition: 'opacity .15s ease',
                    cursor: isZoomed ? 'zoom-out' : 'zoom-in',
                  }}
                  draggable={false}
                />
              </div>
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
