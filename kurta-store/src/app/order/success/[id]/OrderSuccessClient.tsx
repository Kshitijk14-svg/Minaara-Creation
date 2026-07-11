'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useCurrency } from '@/components/providers/CurrencyProvider';
import { trackPurchase } from '@/lib/analytics';
import { localResize } from '@/lib/media';
import type { Order, CartItem } from '@/types/schema';

const CURRENCY_SYMBOLS: Record<string, string> = { INR: '₹', USD: '$', EUR: '€' };

export default function OrderSuccessClient({ order }: { order: Order }) {
  const { currency, convertPrice } = useCurrency();

  const fmt = (p: number) =>
    `${CURRENCY_SYMBOLS[currency] ?? ''}${convertPrice(p).toFixed(currency === 'INR' ? 0 : 2)}`;

  useEffect(() => {
    const cartItems: CartItem[] = order.items.map((item) => ({
      productId: item.productId ?? '',
      variantId: item.variantId ?? '',
      title:     item.title,
      size:      item.size as CartItem['size'],
      imageUrl:  item.imageUrl ?? '',
      quantity:  item.quantity,
      priceINR:  item.priceINR,
    }));
    trackPurchase(order.id, cartItems, order.totalAmountINR);
  }, [order]);

  return (
    <main style={{ backgroundColor: '#FAF8F5', minHeight: '100vh', paddingTop: '80px', paddingBottom: '80px' }}>
      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '0 24px' }}>

        {/* Success Badge */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          style={{ textAlign: 'center', marginBottom: '40px' }}
        >
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'var(--color-brand-charcoal)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', margin: '0 auto 20px' }}>
            ✓
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 300, color: 'var(--color-brand-charcoal)', lineHeight: 1.1, marginBottom: '12px' }}>
            Order Confirmed
          </h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--color-brand-charcoal)', opacity: 0.65, lineHeight: 1.7, maxWidth: '400px', margin: '0 auto' }}>
            Thank you for your purchase. A confirmation email has been sent to{' '}
            <strong style={{ fontWeight: 600 }}>{order.customerEmail}</strong>.
          </p>
        </motion.div>

        {/* Order Details Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.45 }}
          style={{ backgroundColor: 'var(--glass-bg)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: '16px', border: '1px solid var(--glass-border)', padding: '32px', marginBottom: '24px' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div>
              <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-brand-charcoal)', opacity: 0.5 }}>Order Number</p>
              <p style={{ margin: '4px 0 0', fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 600, color: 'var(--color-brand-charcoal)' }}>{order.orderNumber}</p>
            </div>
            <div style={{ padding: '6px 14px', borderRadius: '100px', backgroundColor: order.paymentStatus === 'PAID' ? '#D1FAE5' : '#FEF3C7', fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: order.paymentStatus === 'PAID' ? '#065F46' : '#92400E' }}>
              {order.paymentStatus === 'PAID' ? 'Payment Confirmed' : order.paymentStatus}
            </div>
          </div>

          <div style={{ width: '100%', height: '1px', backgroundColor: 'var(--color-brand-mist)', marginBottom: '24px' }} />

          {/* Items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
            {order.items.map((item) => (
              <div key={item.id} style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                {item.imageUrl && (
                  <div style={{ width: '56px', height: '70px', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'var(--color-brand-blush)', flexShrink: 0 }}>
                    <img src={localResize(item.imageUrl, 120)} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 500, color: 'var(--color-brand-charcoal)' }}>{item.title}</p>
                  <p style={{ margin: '4px 0 0', fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--color-brand-charcoal)', opacity: 0.6 }}>
                    Size: {item.size} · Qty: {item.quantity}
                  </p>
                </div>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 600, color: 'var(--color-brand-charcoal)' }}>
                  {fmt(item.priceINR * item.quantity)}
                </span>
              </div>
            ))}
          </div>

          <div style={{ width: '100%', height: '1px', backgroundColor: 'var(--color-brand-mist)', marginBottom: '16px' }} />

          {/* Price breakdown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-brand-charcoal)', opacity: 0.7 }}>
              <span>Subtotal</span><span>{fmt(order.subtotalINR)}</span>
            </div>
            {order.discountAmountINR > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-brand-gold)', fontWeight: 600 }}>
                <span>Discount{order.coupon ? ` (${order.coupon.code})` : ''}</span>
                <span>−{fmt(order.discountAmountINR)}</span>
              </div>
            )}
            <div style={{ width: '100%', height: '1px', backgroundColor: 'var(--color-brand-mist)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 700, color: 'var(--color-brand-charcoal)' }}>Total Paid</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 300, color: 'var(--color-brand-charcoal)' }}>{fmt(order.totalAmountINR)}</span>
            </div>
          </div>
        </motion.div>

        {/* Shipping Address */}
        {order.shippingAddress && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.4 }}
            style={{ backgroundColor: 'var(--glass-bg)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: '16px', border: '1px solid var(--glass-border)', padding: '24px', marginBottom: '32px' }}
          >
            <h3 style={{ fontFamily: 'var(--font-body)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 600, color: 'var(--color-brand-charcoal)', opacity: 0.5, marginBottom: '12px' }}>
              Shipping to
            </h3>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--color-brand-charcoal)', lineHeight: 1.7, margin: 0 }}>
              {order.shippingAddress.fullName}<br />
              {order.shippingAddress.line1}{order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ''}<br />
              {order.shippingAddress.city}, {order.shippingAddress.state} – {order.shippingAddress.pincode}<br />
              {order.shippingAddress.country}
            </p>
          </motion.div>
        )}

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}
        >
          <Link
            href="/collection"
            style={{ flex: 1, padding: '16px 24px', backgroundColor: 'var(--color-brand-charcoal)', color: '#fff', borderRadius: '4px', textDecoration: 'none', fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', textAlign: 'center' }}
          >
            Continue Shopping
          </Link>
          <Link
            href="/profile"
            style={{ flex: 1, padding: '16px 24px', border: '1px solid var(--color-brand-mist)', borderRadius: '4px', textDecoration: 'none', fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-brand-charcoal)', textAlign: 'center' }}
          >
            My Orders
          </Link>
        </motion.div>

        <p style={{ marginTop: '32px', textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-brand-charcoal)', opacity: 0.45 }}>
          Questions? Reach us at{' '}
          <a href="mailto:support@minaaracreation.com" style={{ color: 'var(--color-brand-mauve)', textDecoration: 'none' }}>
            support@minaaracreation.com
          </a>
        </p>
      </div>
    </main>
  );
}
