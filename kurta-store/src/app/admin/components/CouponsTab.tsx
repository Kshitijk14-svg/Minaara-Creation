'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import type { Coupon } from '@/types/schema';
import AdminTable, { Td } from './shared/AdminTable';
import ConfirmInline from './shared/ConfirmInline';
import { inputStyle, selectStyle } from './shared/FormField';
import LoadingSkeleton from './shared/LoadingSkeleton';

interface CouponUsageRecord {
  usedAt: string;
  user?: { email: string; name?: string };
  order?: { id: string; orderNumber: string; totalAmountINR: number };
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isExpired(s: string) {
  return new Date(s) < new Date();
}

export default function CouponsTab({ initialData }: { initialData?: any }) {
  const router = useRouter();
  const [coupons, setCoupons]         = useState<Coupon[]>(initialData?.data ?? []);
  const [total, setTotal]             = useState<number>(initialData?.total ?? 0);
  const [nextCursor, setNextCursor]   = useState<string | null>(initialData?.nextCursor ?? null);
  const [loading, setLoading]         = useState(!initialData);
  const [search, setSearch]           = useState('');
  const [filterActive, setFilterActive] = useState('');
  const [deleteId, setDeleteId]       = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting]       = useState(false);
  const [usageId, setUsageId]         = useState<string | null>(null);
  const [usageData, setUsageData]     = useState<CouponUsageRecord[] | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const searchTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender    = useRef(true);
  const hadInitialData   = useRef(!!initialData);

  const fetchCoupons = useCallback(async (q: string, active: string, cursor?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('search', q);
      if (active) params.set('isActive', active);
      if (cursor) params.set('cursor', cursor);
      const res = await fetch(`/api/coupons?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (cursor) {
        setCoupons((prev) => [...prev, ...(data.data || [])]);
      } else {
        setCoupons(data.data || []);
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
        fetchCoupons(search, filterActive);
      }
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetchCoupons(search, filterActive);
    }, 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search, filterActive, fetchCoupons]);

  async function loadMore() {
    if (nextCursor) fetchCoupons(search, filterActive, nextCursor);
  }

  async function fetchUsage(couponId: string) {
    if (usageId === couponId) { setUsageId(null); setUsageData(null); return; }
    setUsageId(couponId);
    setUsageLoading(true);
    try {
      const res = await fetch(`/api/coupons/${couponId}`);
      const data = await res.json();
      setUsageData(data.coupon?.orders || []);
    } catch { setUsageData([]); }
    finally { setUsageLoading(false); }
  }

  function openCreate() {
    router.push('/admin/coupons/new');
  }

  function openEdit(c: Coupon) {
    router.push(`/admin/coupons/${c.id}/edit`);
  }

  async function handleToggleActive(c: Coupon) {
    setCoupons((prev) => prev.map((x) => x.id === c.id ? { ...x, isActive: !x.isActive } : x));
    try {
      const res = await fetch('/api/coupons', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, isActive: !c.isActive }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setCoupons((prev) => prev.map((x) => x.id === c.id ? { ...x, isActive: c.isActive } : x));
    }
  }

  async function handleDelete(id: string) {
    setDeleteError(null);
    setDeleting(true);
    try {
      const res = await fetch(`/api/coupons?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        setDeleteError(err.error || 'Delete failed');
        return;
      }
      setCoupons((prev) => prev.filter((c) => c.id !== id));
      setDeleteId(null);
    } catch { setDeleteError('Network error'); }
    finally { setDeleting(false); }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 400, color: 'var(--color-brand-charcoal)', margin: '0 0 4px' }}>
            Coupons
          </h2>
          {!loading && (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--color-brand-charcoal)', opacity: 0.45, margin: 0 }}>
              {total} total
            </p>
          )}
        </div>
        <button
          onClick={openCreate}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: 'var(--color-brand-charcoal)', color: '#fff',
            padding: '10px 18px', borderRadius: '6px', border: 'none',
            fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.15em', cursor: 'pointer',
          }}
          className="btn-liquid"
        >
          + Add Coupon
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <input
          style={{ ...inputStyle, maxWidth: '240px' }}
          placeholder="Search code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          style={{ ...selectStyle, maxWidth: '160px' }}
          value={filterActive}
          onChange={(e) => setFilterActive(e.target.value)}
        >
          <option value="">All coupons</option>
          <option value="true">Active only</option>
          <option value="false">Inactive only</option>
        </select>
      </div>

      {loading && coupons.length === 0 ? (
        <LoadingSkeleton rows={4} />
      ) : (
        <AdminTable
          headers={['Code', 'Type', 'Value', 'Min Order', 'Uses', 'Expiry', 'Active', 'Actions']}
          isEmpty={coupons.length === 0}
        >
          {coupons.map((c, i) => (
            <React.Fragment key={c.id}>
              <motion.tr
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 10) * 0.04, ease: [0.22, 1, 0.36, 1] }}
                className="admin-row-hover"
              >
                <Td mono>{c.code}</Td>
                <Td>
                  <span style={{
                    padding: '3px 8px', borderRadius: '100px',
                    fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em',
                    fontFamily: 'var(--font-body)',
                    background: c.discountType === 'PERCENT' ? 'rgba(50,81,140,0.08)' : 'rgba(166,128,38,0.08)',
                    color: c.discountType === 'PERCENT' ? '#32518C' : '#A68026',
                    border: c.discountType === 'PERCENT' ? '1px solid rgba(50,81,140,0.2)' : '1px solid rgba(166,128,38,0.2)',
                  }}>
                    {c.discountType}
                  </span>
                </Td>
                <Td mono>
                  {c.discountType === 'PERCENT' ? `${c.discountValue}%` : `₹${c.discountValue}`}
                  {c.discountType === 'PERCENT' && c.maxDiscountINR && (
                    <span style={{ opacity: 0.5, fontSize: '10px', marginLeft: '4px' }}>
                      (max ₹{c.maxDiscountINR})
                    </span>
                  )}
                </Td>
                <Td mono style={{ opacity: 0.65 }}>₹{c.minOrderAmountINR}</Td>
                <Td>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                    {c.usedCount}{c.maxUses ? `/${c.maxUses}` : ''}
                  </span>
                </Td>
                <Td style={{ color: isExpired(c.expiryDate) ? '#dc2626' : 'inherit', fontSize: '12px', opacity: isExpired(c.expiryDate) ? 1 : 0.65 }}>
                  {formatDate(c.expiryDate)}
                  {isExpired(c.expiryDate) && <span style={{ fontSize: '9px', marginLeft: '4px', opacity: 0.7 }}>expired</span>}
                </Td>
                <Td>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={c.isActive}
                      onChange={() => handleToggleActive(c)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </Td>
                <Td>
                  <AnimatePresence mode="wait">
                    {deleteId === c.id ? (
                      <ConfirmInline
                        label={deleteError || 'Delete coupon?'}
                        confirmLabel="Delete"
                        onConfirm={() => handleDelete(c.id)}
                        onCancel={() => { setDeleteId(null); setDeleteError(null); }}
                        error={deleteError}
                        loading={deleting}
                      />
                    ) : (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        <button onClick={() => openEdit(c)} style={actionBtnStyle}>Edit</button>
                        <button onClick={() => fetchUsage(c.id)} style={{ ...actionBtnStyle, color: '#32518C' }}>
                          {usageId === c.id ? 'Hide' : 'Usage'}
                        </button>
                        <button onClick={() => { setDeleteId(c.id); setDeleteError(null); }} style={{ ...actionBtnStyle, color: '#dc2626' }}>
                          Delete
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Td>
              </motion.tr>
              {/* Usage Drawer */}
              {usageId === c.id && (
                <tr>
                  <td colSpan={8} style={{ padding: 0, borderBottom: '1px solid var(--color-brand-mist)' }}>
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div style={{ padding: '16px 24px', background: 'rgba(15,42,91,0.02)' }}>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--color-brand-charcoal)', opacity: 0.5, margin: '0 0 12px' }}>
                          Usage History
                        </p>
                        {usageLoading ? (
                          <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-brand-charcoal)', opacity: 0.45 }}>Loading…</p>
                        ) : !usageData?.length ? (
                          <p style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontStyle: 'italic', color: 'var(--color-brand-charcoal)', opacity: 0.35 }}>
                            No usages yet
                          </p>
                        ) : (
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', fontFamily: 'var(--font-body)', minWidth: '500px' }}>
                              <thead>
                                <tr>
                                  {['Customer', 'Order', 'Amount', 'Used At'].map((h) => (
                                    <th key={h} style={{ textAlign: 'left', padding: '6px 12px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-brand-charcoal)', opacity: 0.45, fontWeight: 600 }}>
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {usageData.map((u, idx) => (
                                  <tr key={idx} style={{ borderTop: '1px solid var(--color-brand-mist)' }}>
                                    <td style={{ padding: '8px 12px', color: 'var(--color-brand-charcoal)' }}>
                                      {u.user?.name || u.user?.email || '—'}
                                    </td>
                                    <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-brand-charcoal)', opacity: 0.7 }}>
                                      {u.order?.orderNumber || '—'}
                                    </td>
                                    <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                                      {u.order?.totalAmountINR ? `₹${u.order.totalAmountINR.toLocaleString('en-IN')}` : '—'}
                                    </td>
                                    <td style={{ padding: '8px 12px', opacity: 0.55, fontSize: '11px' }}>
                                      {formatDate(u.usedAt)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </AdminTable>
      )}

      {nextCursor && (
        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <button onClick={loadMore} style={{ ...actionBtnStyle, opacity: 0.7, padding: '8px 20px' }}>
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
