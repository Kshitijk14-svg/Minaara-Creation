'use client';

import React from 'react';

interface MagneticLinkProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  strength?: number;
  radius?: number;
  as?: 'div' | 'span' | 'button';
}

/**
 * MagneticLink — Animation 7: Magnetic Float Nav
 * Simplified pure CSS version for high performance.
 */
export function MagneticLink({
  children,
  className = '',
  style,
  as: Tag = 'span',
}: MagneticLinkProps) {
  return (
    <Tag
      className={`nav-link-magnetic ${className}`}
      style={style}
    >
      {children}
    </Tag>
  );
}
