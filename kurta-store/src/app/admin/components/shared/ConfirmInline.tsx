'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface ConfirmInlineProps {
  label?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  error?: string | null;
  loading?: boolean;
  danger?: boolean;
}

export default function ConfirmInline({
  label = 'Are you sure?',
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
  error,
  loading,
  danger = true,
}: ConfirmInlineProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}
    >
      <span style={{
        fontFamily: 'var(--font-body)', fontSize: '11px',
        color: danger ? '#dc2626' : 'var(--color-brand-charcoal)',
        opacity: danger ? 1 : 0.7,
        whiteSpace: 'nowrap',
      }}>
        {error || label}
      </span>
      <button
        onClick={onCancel}
        style={{
          background: 'none', border: '1px solid var(--color-brand-mist)',
          borderRadius: '6px', padding: '4px 10px',
          fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.1em',
          color: 'var(--color-brand-charcoal)', opacity: 0.6,
          cursor: 'pointer', transition: 'all 0.15s',
        }}
      >
        Cancel
      </button>
      <button
        onClick={onConfirm}
        disabled={loading}
        style={{
          background: danger ? 'rgba(220,38,38,0.08)' : 'rgba(15,42,91,0.08)',
          border: `1px solid ${danger ? 'rgba(220,38,38,0.25)' : 'rgba(15,42,91,0.2)'}`,
          borderRadius: '6px', padding: '4px 10px',
          fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.1em',
          color: danger ? '#dc2626' : 'var(--color-brand-charcoal)',
          cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1,
          transition: 'all 0.15s',
        }}
      >
        {loading ? '...' : confirmLabel}
      </button>
    </motion.div>
  );
}
