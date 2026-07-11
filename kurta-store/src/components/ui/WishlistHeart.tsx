'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useWishlist } from '@/components/providers/WishlistProvider';
import type { WishlistItem } from '@/types/schema';

interface WishlistHeartProps {
  item: Omit<WishlistItem, 'addedAt'>;
  size?: number;
  style?: React.CSSProperties;
  className?: string;
}

export function WishlistHeart({ item, size = 18, style, className }: WishlistHeartProps) {
  const { toggle, has } = useWishlist();
  const active = has(item.productId);

  return (
    <motion.button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle({ ...item, addedAt: Date.now() }); }}
      whileTap={{ scale: 0.85 }}
      aria-label={active ? 'Remove from wishlist' : 'Add to wishlist'}
      aria-pressed={active}
      className={className}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: 'none', background: 'none', cursor: 'pointer', padding: 0,
        color: active ? '#C0392B' : 'var(--color-brand-charcoal)',
        ...style,
      }}
    >
      <svg
        width={size} height={size} viewBox="0 0 24 24"
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      >
        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
      </svg>
    </motion.button>
  );
}
