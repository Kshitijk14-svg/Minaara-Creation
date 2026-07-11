'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { localResize } from '@/lib/media';

interface ProductVideoBubbleProps {
  videoUrl: string;
  posterUrl?: string | null;
  productId: string;
}

const DISMISS_KEY_PREFIX = 'reelVideoDismissed:';
const MOUNT_DELAY_MS = 1200;

export default function ProductVideoBubble({ videoUrl, posterUrl, productId }: ProductVideoBubbleProps) {
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(true); // start true so nothing flashes before the sessionStorage check
  const [expanded, setExpanded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY_PREFIX + productId) === '1');
    } catch {
      setDismissed(false);
    }
    const timer = setTimeout(() => setMounted(true), MOUNT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [productId]);

  function handleDismiss(e: React.MouseEvent) {
    e.stopPropagation();
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY_PREFIX + productId, '1');
    } catch {
      // sessionStorage unavailable (private browsing etc.) — dismissal just won't persist across mounts
    }
  }

  if (!mounted || dismissed) return null;

  const posterSrc = posterUrl ? localResize(posterUrl, 400) : undefined;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, scale: 0.85, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        onClick={() => setExpanded(true)}
        style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 45,
          width: '72px', height: '128px', borderRadius: '14px', overflow: 'hidden',
          cursor: 'pointer', boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
          border: '2px solid rgba(255,255,255,0.9)',
        }}
      >
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
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss video preview"
          style={{
            position: 'absolute', top: '4px', right: '4px',
            width: '20px', height: '20px', borderRadius: '50%',
            background: 'rgba(0,0,0,0.55)', border: 'none',
            color: '#fff', fontSize: '13px', lineHeight: 1,
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
