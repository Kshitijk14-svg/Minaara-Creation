'use client';

import React from 'react';

interface LoadingSkeletonProps {
  rows?: number;
}

export default function LoadingSkeleton({ rows = 3 }: LoadingSkeletonProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0 12px' }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '50%',
          border: '2px solid var(--color-brand-mist)',
          borderTopColor: 'var(--color-brand-charcoal)',
          animation: 'admin-spin 0.75s linear infinite',
        }} />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            height: '60px',
            background: 'var(--admin-card-bg)',
            border: '1px solid var(--admin-card-border)',
            borderRadius: '8px',
            animation: 'pulse 1.5s ease infinite',
            animationDelay: `${i * 0.1}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 0.35; }
        }
        @keyframes admin-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
