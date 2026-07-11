'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import type { Product } from '@/types/schema';
import { localResize } from '@/lib/media';
import AdminTable, { Td } from './shared/AdminTable';
import ConfirmInline from './shared/ConfirmInline';
import { inputStyle } from './shared/FormField';
import LoadingSkeleton from './shared/LoadingSkeleton';
import StatusBadge from './shared/StatusBadge';

interface ProductsTabProps {
  role: string;
  initialData?: any;
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ProductsTab({ role, initialData }: ProductsTabProps) {
  const canWrite = role !== 'STAFF';
  const router = useRouter();

  const [products, setProducts]       = useState<Product[]>(initialData?.data ?? []);
  const [total, setTotal]             = useState<number>(initialData?.total ?? 0);
  const [nextCursor, setNextCursor]   = useState<string | null>(initialData?.nextCursor ?? null);
  const [loading, setLoading]         = useState(!initialData);
  const [search, setSearch]           = useState('');
  const [deleteId, setDeleteId]       = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting]       = useState(false);
  const searchTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender    = useRef(true);
  const hadInitialData   = useRef(!!initialData);

  const fetchProducts = useCallback(async (q: string, cursor?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (q) params.set('search', q);
      if (cursor) params.set('cursor', cursor);
      const res = await fetch(`/api/products?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (cursor) {
        setProducts((prev) => [...prev, ...(data.data || [])]);
      } else {
        setProducts(data.data || []);
      }
      setTotal(data.total ?? 0);
      setNextCursor(data.nextCursor ?? null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      if (!hadInitialData.current) {
        fetchProducts(search);
      }
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { fetchProducts(search); }, 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search, fetchProducts]);

  async function handleDelete(id: string) {
    setDeleteError(null);
    setDeleting(true);
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        setDeleteError(err.error || 'Delete failed');
        return;
      }
      setProducts((prev) => prev.filter((p) => p.id !== id));
      setDeleteId(null);
    } catch { setDeleteError('Network error'); }
    finally { setDeleting(false); }
  }

  const totalStock = (p: Product) => Object.values(p.sizes || {}).reduce((s, n) => s + (n || 0), 0);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 400, color: 'var(--color-brand-charcoal)', margin: '0 0 4px' }}>
            Products
          </h2>
          {!loading && (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--color-brand-charcoal)', opacity: 0.45, margin: 0 }}>
              {total} total (excluding deleted)
            </p>
          )}
        </div>
        {canWrite && (
          <button
            onClick={() => router.push('/admin/products/new')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              background: 'var(--color-brand-charcoal)', color: '#fff',
              padding: '10px 18px', borderRadius: '6px', border: 'none',
              fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.15em', cursor: 'pointer',
            }}
            className="btn-liquid"
          >
            + Add Product
          </button>
        )}
      </div>

      {/* Search */}
      <div style={{ marginBottom: '20px' }}>
        <input
          style={{ ...inputStyle, maxWidth: '320px' }}
          placeholder="Search products…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && products.length === 0 ? (
        <LoadingSkeleton rows={5} />
      ) : (
        <AdminTable
          headers={['', 'Title', 'Collection', 'Price', 'Stock', 'Status', 'Featured', 'Created', 'Actions']}
          isEmpty={products.length === 0}
        >
          {products.map((p, i) => (
            <motion.tr
              key={p.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 10) * 0.04, ease: [0.22, 1, 0.36, 1] }}
              className="admin-row-hover"
            >
              {/* Thumbnail */}
              <Td style={{ width: '52px', padding: '10px 8px 10px 16px' }}>
                {p.images?.[0] ? (
                  <img
                    src={localResize(p.images[0], 80)}
                    alt={p.title}
                    style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: '6px', display: 'block', background: 'var(--color-brand-mist)' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div style={{ width: 40, height: 40, borderRadius: '6px', background: 'var(--color-brand-mist)' }} />
                )}
              </Td>
              <Td>
                <span style={{ fontWeight: 500, fontSize: '13px', display: 'block', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.title}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-brand-charcoal)', opacity: 0.4 }}>
                  {p.slug}
                </span>
              </Td>
              <Td style={{ opacity: 0.65, fontSize: '12px' }}>{p.collection?.name || p.category || '—'}</Td>
              <Td mono>
                ₹{p.priceINR.toLocaleString('en-IN')}
                {p.compareAtPriceINR && (
                  <span style={{ fontSize: '10px', opacity: 0.45, marginLeft: '4px', textDecoration: 'line-through' }}>
                    ₹{p.compareAtPriceINR.toLocaleString('en-IN')}
                  </span>
                )}
              </Td>
              <Td mono style={{ opacity: 0.7 }}>{totalStock(p)}</Td>
              <Td>
                <StatusBadge status={p.isActive ? 'ACTIVE' : 'INACTIVE'} type="order" />
              </Td>
              <Td>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {p.isFeatured && (
                    <span title="Featured" style={{ fontSize: '10px', fontFamily: 'var(--font-body)', color: '#A68026', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                      ★
                    </span>
                  )}
                  {p.isBestseller && (
                    <span title="Bestseller" style={{ fontSize: '9px', fontFamily: 'var(--font-body)', color: '#A68026', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 6px', borderRadius: '3px', background: 'rgba(166,128,38,0.12)' }}>
                      BEST
                    </span>
                  )}
                  {p.isNewArrival && (
                    <span title="New Arrival" style={{ fontSize: '9px', fontFamily: 'var(--font-body)', color: '#32518C', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 6px', borderRadius: '3px', background: 'rgba(50,81,140,0.1)' }}>
                      NEW
                    </span>
                  )}
                </div>
              </Td>
              <Td style={{ opacity: 0.55, fontSize: '12px' }}>{formatDate(p.createdAt)}</Td>
              <Td>
                <AnimatePresence mode="wait">
                  {deleteId === p.id ? (
                    <ConfirmInline
                      label={deleteError || 'Delete this product?'}
                      confirmLabel="Delete"
                      onConfirm={() => handleDelete(p.id)}
                      onCancel={() => { setDeleteId(null); setDeleteError(null); }}
                      error={deleteError}
                      loading={deleting}
                    />
                  ) : (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => router.push(`/admin/products/${p.id}/edit`)} style={actionBtnStyle}>Edit</button>
                      {canWrite && (
                        <button onClick={() => { setDeleteId(p.id); setDeleteError(null); }} style={{ ...actionBtnStyle, color: '#dc2626' }}>
                          Delete
                        </button>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </Td>
            </motion.tr>
          ))}
        </AdminTable>
      )}

      {nextCursor && (
        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <button onClick={() => fetchProducts(search, nextCursor!)} style={{ ...actionBtnStyle, opacity: 0.7, padding: '8px 20px' }}>
            Load more
          </button>
        </div>
      )}

    </div>
  );
}

const actionBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600,
  color: 'var(--color-brand-charcoal)', opacity: 0.6,
  padding: '4px 8px', borderRadius: '4px',
  textTransform: 'uppercase', letterSpacing: '0.1em',
};
