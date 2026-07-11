'use client';

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  width?: string;
  children: React.ReactNode;
}

export default function AdminModal({ isOpen, onClose, title, width = '540px', children }: AdminModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(15, 42, 91, 0.45)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: width, maxHeight: '90vh',
              overflowY: 'auto',
              background: 'var(--admin-card-bg)',
              border: '1px solid var(--admin-card-border)',
              borderRadius: '16px',
              boxShadow: '0 24px 64px rgba(15,42,91,0.18)',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '24px 28px 20px',
              borderBottom: '1px solid var(--color-brand-mist)',
            }}>
              <h2 style={{
                fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 400,
                color: 'var(--color-brand-charcoal)', margin: 0, letterSpacing: '0.01em',
              }}>
                {title}
              </h2>
              <button
                onClick={onClose}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--color-brand-charcoal)', opacity: 0.4,
                  padding: '4px', borderRadius: '4px', lineHeight: 1,
                  fontSize: '20px', fontFamily: 'var(--font-body)',
                  transition: 'opacity 0.15s',
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            {/* Body */}
            <div style={{ padding: '24px 28px 28px' }}>
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
