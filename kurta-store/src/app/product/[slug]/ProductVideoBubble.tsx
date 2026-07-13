'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import Image from 'next/image';
import { localResize } from '@/lib/media';
import { useIsMobile } from '@/lib/useIsMobile';

interface ProductVideoBubbleProps {
  videoUrl: string;
  posterUrl?: string | null;
  productId: string;
}

const MOUNT_DELAY_MS = 1200;
const BUBBLE_WIDTH = 104;
const BUBBLE_HEIGHT = 185;
const EDGE_MARGIN = 24;
const DRAG_CLICK_THRESHOLD = 5;

export default function ProductVideoBubble({ videoUrl, posterUrl, productId }: ProductVideoBubbleProps) {
  const [mounted, setMounted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [dragConstraints, setDragConstraints] = useState({ top: 0, left: 0, right: 0, bottom: 0 });
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasDraggedRef = useRef(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), MOUNT_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    function updateConstraints() {
      setDragConstraints({
        top: -(window.innerHeight - BUBBLE_HEIGHT - 2 * EDGE_MARGIN),
        left: -(window.innerWidth - BUBBLE_WIDTH - 2 * EDGE_MARGIN),
        right: 0,
        bottom: 0,
      });
    }
    updateConstraints();
    window.addEventListener('resize', updateConstraints);
    return () => window.removeEventListener('resize', updateConstraints);
  }, []);

  function handleDismiss(e: React.MouseEvent) {
    e.stopPropagation();
    setDismissed(true);
  }

  function handleDrag(_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    if (Math.abs(info.offset.x) > DRAG_CLICK_THRESHOLD || Math.abs(info.offset.y) > DRAG_CLICK_THRESHOLD) {
      hasDraggedRef.current = true;
    }
  }

  function handleBubbleClick() {
    if (hasDraggedRef.current) {
      hasDraggedRef.current = false;
      return;
    }
    setExpanded(true);
  }

  if (!mounted || dismissed) return null;

  const posterSrc = posterUrl ? localResize(posterUrl, 400) : undefined;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, scale: 0.85, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        drag={isMobile === false}
        dragConstraints={dragConstraints}
        dragMomentum={false}
        dragElastic={0.05}
        whileDrag={{ cursor: 'grabbing' }}
        onDrag={handleDrag}
        onClick={handleBubbleClick}
        style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 45,
          width: `${BUBBLE_WIDTH}px`, height: `${BUBBLE_HEIGHT}px`, borderRadius: '16px', overflow: 'hidden',
          cursor: isMobile ? 'pointer' : 'grab', boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
          border: '2px solid rgba(255,255,255,0.9)', touchAction: 'none',
        }}
      >
        {isMobile ? (
          // Mobile: never fetch/autoplay the clip in the tiny bubble — show the
          // poster with a play affordance; tapping expands straight to the
          // modal (below), which is where playback actually begins.
          <>
            {posterSrc ? (
              <Image src={posterSrc} alt="" fill sizes={`${BUBBLE_WIDTH}px`} style={{ objectFit: 'cover', pointerEvents: 'none' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', backgroundColor: '#000' }} />
            )}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
              </div>
            </div>
          </>
        ) : (
          <video
            ref={videoRef}
            src={videoUrl}
            poster={posterSrc}
            muted
            loop
            autoPlay
            playsInline
            preload="none"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }}
          />
        )}
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handleDismiss}
          aria-label="Dismiss video preview"
          style={{
            position: 'absolute', top: '6px', right: '6px',
            width: '24px', height: '24px', borderRadius: '50%',
            background: 'rgba(0,0,0,0.55)', border: 'none',
            color: '#fff', fontSize: '15px', lineHeight: 1,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0,
          }}
        >
          ×
        </button>
      </motion.div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => setExpanded(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 80,
              backgroundColor: 'rgba(0,0,0,0.75)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '24px',
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'relative', width: '100%', maxWidth: '420px', aspectRatio: '9/16',
                borderRadius: '16px', overflow: 'hidden', backgroundColor: '#000',
              }}
            >
              <video
                src={videoUrl}
                poster={posterSrc}
                muted
                loop
                autoPlay
                playsInline
                controls
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
              />
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Close video"
                style={{
                  position: 'absolute', top: '12px', right: '12px',
                  width: '32px', height: '32px', borderRadius: '50%',
                  background: 'rgba(0,0,0,0.6)', border: 'none',
                  color: '#fff', fontSize: '18px', lineHeight: 1,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 0,
                }}
              >
                ×
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
