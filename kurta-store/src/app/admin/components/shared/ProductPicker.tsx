'use client';

import React, { useEffect, useRef, useState } from 'react';
import { localResize } from '@/lib/media';
import { inputStyle } from './FormField';

export interface PickableProduct {
  id: string;
  title: string;
  slug: string;
  priceINR: number;
  images: string[];
}

interface ProductPickerProps {
  onSelect: (product: PickableProduct) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export default function ProductPicker({ onSelect, placeholder = 'Search products…', autoFocus }: ProductPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PickableProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      const trimmed = query.trim();
      if (!trimmed) { setResults([]); setLoading(false); return; }
      setLoading(true);
      try {
        const res = await fetch(`/api/products?search=${encodeURIComponent(trimmed)}&isActive=true&limit=8`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.data ?? []);
          setOpen(true);
        }
      } catch {
        // network failure — leave results as-is
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        placeholder={placeholder}
        style={inputStyle}
      />
      {open && (query.trim().length > 0) && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
          maxHeight: '280px', overflowY: 'auto', borderRadius: '8px',
          border: '1px solid var(--color-brand-mist)', backgroundColor: '#fff',
          boxShadow: '0 12px 32px rgba(0,0,0,0.14)',
        }}>
          {loading && (
            <div style={{ padding: '12px', fontSize: '12px', fontFamily: 'var(--font-body)', opacity: 0.5 }}>Searching…</div>
          )}
          {!loading && results.length === 0 && (
            <div style={{ padding: '12px', fontSize: '12px', fontFamily: 'var(--font-body)', opacity: 0.5 }}>No products found.</div>
          )}
          {!loading && results.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onSelect(p); setQuery(''); setResults([]); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                padding: '10px 12px', border: 'none', background: 'none', cursor: 'pointer',
                textAlign: 'left', borderBottom: '1px solid var(--color-brand-mist)',
              }}
            >
              {p.images?.[0] && (
                <img src={localResize(p.images[0], 80)} alt={p.title} style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontFamily: 'var(--font-body)', color: 'var(--color-brand-charcoal)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</div>
                <div style={{ fontSize: '11px', fontFamily: 'var(--font-body)', color: 'var(--color-brand-charcoal)', opacity: 0.55 }}>₹{p.priceINR.toLocaleString('en-IN')}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
