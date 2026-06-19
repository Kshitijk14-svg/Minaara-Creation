'use client';

import React from 'react';

interface FormFieldProps {
  label: string;
  error?: string | null;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}

export default function FormField({ label, error, required, hint, children }: FormFieldProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label style={{
        fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.2em',
        color: 'var(--color-brand-charcoal)', opacity: 0.65,
      }}>
        {label}{required && <span style={{ color: '#dc2626', marginLeft: '2px' }}>*</span>}
      </label>
      {children}
      {hint && !error && (
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: '11px',
          color: 'var(--color-brand-charcoal)', opacity: 0.4, margin: 0,
        }}>
          {hint}
        </p>
      )}
      {error && (
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: '11px',
          color: '#dc2626', margin: 0,
        }}>
          {error}
        </p>
      )}
    </div>
  );
}

export const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  borderRadius: '6px',
  border: '1px solid var(--color-brand-mist)',
  backgroundColor: 'rgba(255,255,255,0.6)',
  color: 'var(--color-brand-charcoal)',
  fontSize: '13px', fontFamily: 'var(--font-body)',
  outline: 'none', transition: 'border-color 0.2s',
  boxSizing: 'border-box',
};

export const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%230F2A5B' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: '32px',
};
