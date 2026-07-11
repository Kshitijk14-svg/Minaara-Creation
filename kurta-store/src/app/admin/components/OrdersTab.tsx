'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Order, OrderStatus, PaymentStatus } from '@/types/schema';
import { localResize } from '@/lib/media';
import AdminTable, { Td } from './shared/AdminTable';
import ConfirmInline from './shared/ConfirmInline';
import FormField, { inputStyle, selectStyle } from './shared/FormField';
import LoadingSkeleton from './shared/LoadingSkeleton';
import StatusBadge from './shared/StatusBadge';

const ORDER_STATUSES: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'];
const PAYMENT_STATUSES: PaymentStatus[] = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'];

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(s: string) {
  return new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function OrdersTab({ initialData }: { initialData?: any }) {
  const [orders, setOrders]           = useState<Order[]>(initialData?.data ?? []);
  const [total, setTotal]             = useState<number>(initialData?.total ?? 0);
  const [nextCursor, setNextCursor]   = useState<string | null>(initialData?.nextCursor ?? null);
  const [loading, setLoading]         = useState(!initialData);
  const [statusFilter, setStatusFilter]   = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [emailSearch, setEmailSearch]     = useState('');
  const [detailId, setDetailId]       = useState<string | null>(null);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [updatingId, setUpdatingId]   = useState<string | null>(null);
  const [updateStatus, setUpdateStatus]   = useState('');
  const [updatePayment, setUpdatePayment] = useState('');
  const [updateNotes, setUpdateNotes] = useState('');
  const [saving, setSaving]           = useState(false);
  const [cancelId, setCancelId]       = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelling, setCancelling]   = useState(false);
  const emailTimer       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender    = useRef(true);
  const hadInitialData   = useRef(!!initialData);

  const fetchOrders = useCallback(async (status: string, payment: string, email: string, cursor?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (status)  params.set('status', status);
      if (payment) params.set('paymentStatus', payment);
      if (email)   params.set('email', email);
      if (cursor)  params.set('cursor', cursor);
      const res = await fetch(`/api/orders?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (cursor) {
        setOrders((prev) => [...prev, ...(data.data || [])]);
      } else {
        setOrders(data.data || []);
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
        fetchOrders(statusFilter, paymentFilter, emailSearch);
        setDetailId(null);
      }
      return;
    }
    if (emailTimer.current) clearTimeout(emailTimer.current);
    emailTimer.current = setTimeout(() => {
      fetchOrders(statusFilter, paymentFilter, emailSearch);
      setDetailId(null);
    }, 350);
    return () => { if (emailTimer.current) clearTimeout(emailTimer.current); };
  }, [statusFilter, paymentFilter, emailSearch, fetchOrders]);

  function toggleDetail(orderId: string, order: Order) {
    if (detailId === orderId) { setDetailId(null); setDetailOrder(null); return; }
    setDetailId(orderId);
    setUpdatingId(orderId);
    setUpdateStatus(order.status);
    setUpdatePayment(order.paymentStatus);
    setUpdateNotes(order.notes || '');
    setDetailLoading(false);
    setDetailOrder(order);
  }

  async function handleStatusUpdate(orderId: string) {
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      if (updateStatus)  payload.status = updateStatus;
      if (updatePayment) payload.paymentStatus = updatePayment;
      if (updateNotes)   payload.notes = updateNotes;
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return;
      setOrders((prev) => prev.map((o) =>
        o.id === orderId ? { ...o, status: updateStatus as OrderStatus, paymentStatus: updatePayment as PaymentStatus } : o
      ));
      if (detailOrder?.id === orderId) {
        setDetailOrder((d) => d ? { ...d, status: updateStatus as OrderStatus, paymentStatus: updatePayment as PaymentStatus } : d);
      }
    } catch { /* silent */ }
    finally { setSaving(false); }
  }

  async function handleCancel(orderId: string) {
    setCancelError(null);
    setCancelling(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        setCancelError(err.error || 'Cancel failed');
        return;
      }
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: 'CANCELLED' } : o));
      if (detailOrder?.id === orderId) setDetailOrder((d) => d ? { ...d, status: 'CANCELLED' } : d);
      setCancelId(null);
      setDetailId(null);
    } catch { setCancelError('Network error'); }
    finally { setCancelling(false); }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 400, color: 'var(--color-brand-charcoal)', margin: '0 0 4px' }}>
            Orders
          </h2>
          {!loading && (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--color-brand-charcoal)', opacity: 0.45, margin: 0 }}>
              {total} orders
            </p>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <input
          style={{ ...inputStyle, maxWidth: '220px' }}
          placeholder="Filter by email…"
          value={emailSearch}
          onChange={(e) => setEmailSearch(e.target.value)}
        />
        <select style={{ ...selectStyle, maxWidth: '180px' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select style={{ ...selectStyle, maxWidth: '180px' }} value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}>
          <option value="">All payments</option>
          {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading && orders.length === 0 ? (
        <LoadingSkeleton rows={5} />
      ) : (
        <div style={{
          background: 'var(--admin-card-bg)',
          border: '1px solid var(--admin-card-border)',
          borderRadius: '12px',
          boxShadow: 'var(--admin-card-shadow)',
          overflow: 'hidden',
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
              <thead>
                <tr style={{ background: 'rgba(15,42,91,0.04)', borderBottom: '1px solid var(--color-brand-mist)' }}>
                  {['Order #', 'Customer', 'Status', 'Payment', 'Items', 'Total', 'Date', ''].map((h) => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--color-brand-charcoal)', opacity: 0.5, whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding: '48px 24px', textAlign: 'center' }}>
                    <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontStyle: 'italic', color: 'var(--color-brand-charcoal)', opacity: 0.35, margin: 0 }}>No orders found</p>
                  </td></tr>
                ) : orders.map((order, i) => (
                  <React.Fragment key={order.id}>
                    <motion.tr
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i, 10) * 0.04, ease: [0.22, 1, 0.36, 1] }}
                      className="admin-row-hover"
                      onClick={() => toggleDetail(order.id, order)}
                      style={{ cursor: 'pointer' }}
                    >
                      <Td mono style={{ opacity: 0.75, fontSize: '11px' }}>
                        {order.orderNumber || `#${order.id.slice(-8).toUpperCase()}`}
                      </Td>
                      <Td style={{ fontSize: '12px', maxWidth: '180px' }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {order.customerEmail}
                        </span>
                        {order.customerPhone && (
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', opacity: 0.45 }}>{order.customerPhone}</span>
                        )}
                      </Td>
                      <Td><StatusBadge status={order.status} type="order" /></Td>
                      <Td><StatusBadge status={order.paymentStatus} type="payment" /></Td>
                      <Td mono style={{ opacity: 0.7 }}>{order.items?.length ?? 0}</Td>
                      <Td>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 400 }}>
                          ₹{order.totalAmountINR.toLocaleString('en-IN')}
                        </span>
                      </Td>
                      <Td style={{ opacity: 0.55, fontSize: '11px', whiteSpace: 'nowrap' }}>{formatDate(order.createdAt)}</Td>
                      <Td style={{ textAlign: 'right', paddingRight: '16px' }}>
                        <span style={{ color: 'var(--color-brand-charcoal)', opacity: 0.35, fontSize: '12px' }}>
                          {detailId === order.id ? '▲' : '▼'}
                        </span>
                      </Td>
                    </motion.tr>

                    {/* Inline Detail Panel */}
                    {detailId === order.id && (
                      <tr>
                        <td colSpan={8} style={{ padding: 0, borderBottom: '1px solid var(--color-brand-mist)' }}>
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                            style={{ overflow: 'hidden' }}
                          >
                            <div style={{ padding: '24px', background: 'rgba(15,42,91,0.015)' }}>
                              {detailLoading ? (
                                <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', opacity: 0.45 }}>Loading details…</p>
                              ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', flexWrap: 'wrap' }}>
                                  {/* Left: Order items + Shipping */}
                                  <div>
                                    <p style={sectionLabel}>Order Items</p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                                      {(detailOrder?.items || order.items || []).map((item, idx) => (
                                        <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                          {item.imageUrl && (
                                            <img src={localResize(item.imageUrl, 80)} alt={item.title} style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }} />
                                          )}
                                          <div style={{ flex: 1 }}>
                                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 500, color: 'var(--color-brand-charcoal)', margin: '0 0 2px' }}>
                                              {item.title}
                                            </p>
                                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--color-brand-charcoal)', opacity: 0.5, margin: 0 }}>
                                              {item.size} · Qty {item.quantity} · ₹{item.priceINR.toLocaleString('en-IN')} each
                                            </p>
                                          </div>
                                        </div>
                                      ))}
                                    </div>

                                    {/* Totals */}
                                    <div style={{ borderTop: '1px solid var(--color-brand-mist)', paddingTop: '12px' }}>
                                      {[
                                        { label: 'Subtotal', value: `₹${(detailOrder || order).subtotalINR?.toLocaleString('en-IN') || '—'}` },
                                        ...(((detailOrder || order).discountAmountINR || 0) > 0 ? [{ label: 'Discount', value: `-₹${(detailOrder || order).discountAmountINR?.toLocaleString('en-IN')}` }] : []),
                                        { label: 'Total', value: `₹${(detailOrder || order).totalAmountINR?.toLocaleString('en-IN')}` },
                                      ].map((row) => (
                                        <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                          <span style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-brand-charcoal)', opacity: 0.55 }}>{row.label}</span>
                                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--color-brand-charcoal)' }}>{row.value}</span>
                                        </div>
                                      ))}
                                    </div>

                                    {/* Shipping Address */}
                                    {(detailOrder?.shippingAddress || order.shippingAddress) && (
                                      <div style={{ marginTop: '16px' }}>
                                        <p style={sectionLabel}>Shipping Address</p>
                                        {(() => {
                                          const addr = detailOrder?.shippingAddress || order.shippingAddress!;
                                          return (
                                            <div style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-brand-charcoal)', lineHeight: 1.7, opacity: 0.7 }}>
                                              <div>{addr.fullName}</div>
                                              <div>{addr.line1}{addr.line2 ? `, ${addr.line2}` : ''}</div>
                                              <div>{addr.city}, {addr.state} — {addr.pincode}</div>
                                              <div>{addr.country}</div>
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    )}
                                  </div>

                                  {/* Right: Status Update + Actions */}
                                  <div>
                                    <p style={sectionLabel}>Update Order</p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
                                      <FormField label="Order Status">
                                        <select
                                          style={selectStyle}
                                          value={updateStatus}
                                          onChange={(e) => setUpdateStatus(e.target.value)}
                                        >
                                          {ORDER_STATUSES.map((s) => (
                                            <option key={s} value={s}>{s}</option>
                                          ))}
                                        </select>
                                      </FormField>
                                      <FormField label="Payment Status">
                                        <select
                                          style={selectStyle}
                                          value={updatePayment}
                                          onChange={(e) => setUpdatePayment(e.target.value)}
                                        >
                                          {PAYMENT_STATUSES.map((s) => (
                                            <option key={s} value={s}>{s}</option>
                                          ))}
                                        </select>
                                      </FormField>
                                      <FormField label="Notes">
                                        <textarea
                                          style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' } as React.CSSProperties}
                                          value={updateNotes}
                                          onChange={(e) => setUpdateNotes(e.target.value)}
                                          placeholder="Internal notes…"
                                        />
                                      </FormField>
                                    </div>

                                    <button
                                      onClick={() => handleStatusUpdate(order.id)}
                                      disabled={saving}
                                      style={{
                                        padding: '10px 18px', borderRadius: '6px', border: 'none',
                                        background: 'var(--color-brand-charcoal)', color: '#fff',
                                        fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600,
                                        textTransform: 'uppercase', letterSpacing: '0.12em',
                                        cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
                                        marginBottom: '16px',
                                      }}
                                      className="btn-liquid"
                                    >
                                      {saving ? 'Saving…' : 'Update Order'}
                                    </button>

                                    {/* Cancel */}
                                    <div style={{ borderTop: '1px solid rgba(220,38,38,0.12)', paddingTop: '16px' }}>
                                      <p style={{ fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#dc2626', opacity: 0.7, margin: '0 0 8px' }}>
                                        Danger Zone
                                      </p>
                                      {(detailOrder?.status || order.status) === 'DELIVERED' ? (
                                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--color-brand-charcoal)', opacity: 0.4, margin: 0 }}>
                                          Cannot cancel a delivered order.
                                        </p>
                                      ) : (detailOrder?.status || order.status) === 'CANCELLED' ? (
                                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--color-brand-charcoal)', opacity: 0.4, margin: 0 }}>
                                          Order is already cancelled.
                                        </p>
                                      ) : cancelId === order.id ? (
                                        <ConfirmInline
                                          label={cancelError || 'Cancel order and restore stock?'}
                                          confirmLabel="Cancel Order"
                                          onConfirm={() => handleCancel(order.id)}
                                          onCancel={() => { setCancelId(null); setCancelError(null); }}
                                          error={cancelError}
                                          loading={cancelling}
                                        />
                                      ) : (
                                        <button
                                          onClick={() => { setCancelId(order.id); setCancelError(null); }}
                                          style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                                            padding: '8px 14px',
                                            background: 'rgba(220,38,38,0.06)',
                                            border: '1px solid rgba(220,38,38,0.15)',
                                            borderRadius: '6px', cursor: 'pointer',
                                            color: '#dc2626', fontFamily: 'var(--font-body)', fontSize: '10px',
                                            fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em',
                                          }}
                                        >
                                          Cancel Order
                                        </button>
                                      )}
                                    </div>

                                    {/* Meta */}
                                    <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                      {[
                                        { label: 'Placed', value: formatDateTime(order.createdAt) },
                                        ...(order.paymentMethod ? [{ label: 'Payment', value: order.paymentMethod }] : []),
                                        ...(order.coupon ? [{ label: 'Coupon', value: `${order.coupon.code} (${order.coupon.discountType === 'PERCENT' ? `${order.coupon.discountValue}%` : `₹${order.coupon.discountValue}`})` }] : []),
                                      ].map((row) => (
                                        <div key={row.label} style={{ display: 'flex', gap: '8px' }}>
                                          <span style={{ fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-brand-charcoal)', opacity: 0.4, whiteSpace: 'nowrap', minWidth: '60px' }}>
                                            {row.label}
                                          </span>
                                          <span style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-brand-charcoal)', opacity: 0.7 }}>
                                            {row.value}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {nextCursor && (
        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <button
            onClick={() => fetchOrders(statusFilter, paymentFilter, emailSearch, nextCursor!)}
            style={{
              background: 'none', border: '1px solid var(--color-brand-mist)',
              borderRadius: '6px', padding: '8px 20px', cursor: 'pointer',
              fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600,
              color: 'var(--color-brand-charcoal)', opacity: 0.6,
              textTransform: 'uppercase', letterSpacing: '0.12em',
            }}
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}

const sectionLabel: React.CSSProperties = {
  fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.18em',
  color: 'var(--color-brand-charcoal)', opacity: 0.45,
  margin: '0 0 12px',
};
