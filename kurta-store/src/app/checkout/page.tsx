'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '@/components/providers/CartProvider';
import { useCurrency } from '@/components/providers/CurrencyProvider';
import { localResize } from '@/lib/media';

const CURRENCY_SYMBOLS: Record<string, string> = { INR: '₹', USD: '$', EUR: '€' };

interface ShippingForm {
  fullName: string;
  email: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

const EMPTY_FORM: ShippingForm = {
  fullName: '', email: '', phone: '',
  line1: '', line2: '', city: '', state: '', pincode: '', country: 'India',
};

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p style={{ marginTop: '4px', fontFamily: 'var(--font-body)', fontSize: '11px', color: '#C0392B' }}>{msg}</p>;
}

function validate(f: ShippingForm, cartEmpty: boolean): Partial<Record<keyof ShippingForm | 'cart', string>> {
  const e: Partial<Record<keyof ShippingForm | 'cart', string>> = {};
  if (cartEmpty) e.cart = 'Your bag is empty.';
  if (!f.fullName.trim()) e.fullName = 'Full name is required';
  if (!f.email.trim() || !/\S+@\S+\.\S+/.test(f.email)) e.email = 'Valid email is required';
  if (!f.phone.trim() || f.phone.trim().length < 10) e.phone = 'Valid phone number is required';
  if (!f.line1.trim()) e.line1 = 'Address line 1 is required';
  if (!f.city.trim()) e.city = 'City is required';
  if (!f.state.trim()) e.state = 'State is required';
  if (!f.pincode.trim() || f.pincode.trim().length < 4) e.pincode = 'Valid pincode is required';
  return e;
}

declare global {
  interface Window {
    Razorpay: new (opts: Record<string, unknown>) => { open(): void };
  }
}

export default function CheckoutPage() {
  const router = useRouter();
  const { items, clear, subtotalINR } = useCart();
  const { currency, convertPrice } = useCurrency();

  const [form, setForm]             = useState<ShippingForm>(EMPTY_FORM);
  const [errors, setErrors]         = useState<Partial<Record<keyof ShippingForm | 'cart', string>>>({});
  const [couponCode, setCouponCode] = useState('');
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [discountINR, setDiscountINR] = useState(0);
  const [couponError, setCouponError] = useState('');
  const [isApplying, setIsApplying]   = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError]   = useState('');

  const [shippingINR, setShippingINR]     = useState<number | null>(null);
  const [shippingStatus, setShippingStatus] = useState<'idle' | 'loading' | 'ready'>('idle');

  const fmt = useCallback(
    (p: number) => `${CURRENCY_SYMBOLS[currency] ?? ''}${convertPrice(p).toFixed(currency === 'INR' ? 0 : 2)}`,
    [currency, convertPrice],
  );

  const fetchShippingRate = useCallback(async (pincode: string): Promise<number> => {
    if (subtotalINR >= 2000 || subtotalINR === 0) return 0;
    try {
      const res = await fetch('/api/shipping/rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pincode,
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        }),
      });
      if (!res.ok) return 150;
      const data = await res.json();
      return typeof data.shippingINR === 'number' ? data.shippingINR : 150;
    } catch {
      return 150;
    }
  }, [items, subtotalINR]);

  // Live delivery-charge quote as the pincode is entered — free at/above ₹2,000
  // resolves instantly with no request; otherwise debounced against /api/shipping/rate.
  useEffect(() => {
    if (subtotalINR >= 2000 || subtotalINR === 0) {
      setShippingINR(0);
      setShippingStatus('ready');
      return;
    }
    const pincode = form.pincode.trim();
    if (pincode.length < 4) {
      setShippingINR(null);
      setShippingStatus('idle');
      return;
    }
    setShippingStatus('loading');
    const timer = setTimeout(() => {
      fetchShippingRate(pincode).then((rate) => {
        setShippingINR(rate);
        setShippingStatus('ready');
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [form.pincode, subtotalINR, fetchShippingRate]);

  const totalINR = Math.max(0, subtotalINR - discountINR + (shippingINR ?? 0));

  const handleField = (k: keyof ShippingForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((err) => { const next = { ...err }; delete next[k]; return next; });
  };

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCode.trim()) return;
    setIsApplying(true);
    setCouponError('');
    try {
      const res  = await fetch('/api/coupons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: couponCode }) });
      const data = await res.json();
      if (res.ok) {
        const discount = data.discountType === 'PERCENT'
          ? Math.min(subtotalINR * (data.discountValue / 100), data.maxDiscountINR ?? Infinity)
          : Math.min(data.discountValue, subtotalINR);
        setDiscountINR(Math.round(discount));
        setAppliedCode(couponCode.toUpperCase().trim());
        setCouponCode('');
      } else {
        setCouponError(data.error ?? 'Invalid coupon code');
      }
    } catch {
      setCouponError('Failed to validate coupon. Please try again.');
    } finally {
      setIsApplying(false);
    }
  };

  const handlePay = async () => {
    const validationErrors = validate(form, items.length === 0);
    if (Object.keys(validationErrors).length > 0) { setErrors(validationErrors); return; }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      // The debounced quote may not have resolved yet if the user was quick —
      // make sure we have a rate before creating a chargeable Razorpay order.
      let resolvedShippingINR = shippingINR;
      if (resolvedShippingINR === null) {
        resolvedShippingINR = await fetchShippingRate(form.pincode.trim());
        setShippingINR(resolvedShippingINR);
        setShippingStatus('ready');
      }

      // 1. Create Razorpay order
      const rzpRes = await fetch('/api/payment/create-razorpay-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((i) => ({
            productId: i.productId, variantId: i.variantId,
            size: i.size, quantity: i.quantity, priceINR: i.priceINR,
          })),
          couponCode: appliedCode ?? undefined,
          pincode: form.pincode.trim(),
        }),
      });

      if (!rzpRes.ok) {
        const err = await rzpRes.json();
        setSubmitError(err.error ?? 'Failed to initiate payment. Please try again.');
        setIsSubmitting(false);
        return;
      }

      const rzpData = await rzpRes.json();

      // 2. Load Razorpay checkout.js and open modal
      if (!window.Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const s   = document.createElement('script');
          s.src     = 'https://checkout.razorpay.com/v1/checkout.js';
          s.onload  = () => resolve();
          s.onerror = () => reject(new Error('Failed to load Razorpay'));
          document.body.appendChild(s);
        });
      }

      const orderPayload = {
        customerEmail:   form.email,
        customerPhone:   form.phone,
        shippingAddress: {
          fullName: form.fullName, line1: form.line1, line2: form.line2 || undefined,
          city: form.city, state: form.state, pincode: form.pincode, country: form.country,
        },
        items: items.map((i) => ({
          productId: i.productId, variantId: i.variantId, size: i.size, quantity: i.quantity,
        })),
        couponCode: appliedCode ?? undefined,
        currency:   'INR' as const,
      };

      new window.Razorpay({
        key:         rzpData.keyId,
        amount:      rzpData.amount,
        currency:    rzpData.currency,
        order_id:    rzpData.razorpayOrderId,
        name:        'Minara Creation',
        description: `Order for ${items.length} item${items.length > 1 ? 's' : ''}`,
        image:       '/logo.png',
        prefill: { name: form.fullName, email: form.email, contact: form.phone },
        theme: { color: '#0F2A5B' },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          const verifyRes = await fetch('/api/payment/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...response, orderPayload }),
          });

          if (verifyRes.ok) {
            const { orderId } = await verifyRes.json();
            clear();
            router.push(`/order/success/${orderId}`);
          } else {
            const err = await verifyRes.json();
            setSubmitError(err.error ?? 'Payment verified but order creation failed. Please contact support with your payment ID: ' + response.razorpay_payment_id);
            setIsSubmitting(false);
          }
        },
        modal: {
          ondismiss: () => setIsSubmitting(false),
        },
      }).open();
    } catch (err) {
      setSubmitError('An unexpected error occurred. Please try again.');
      setIsSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 16px', borderRadius: '4px',
    border: '1px solid var(--color-brand-mist)', backgroundColor: 'rgba(255,255,255,0.7)',
    color: 'var(--color-brand-charcoal)', fontFamily: 'var(--font-body)', fontSize: '14px',
    outline: 'none', transition: 'border-color 0.2s',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontFamily: 'var(--font-body)', fontSize: '10px',
    textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 600,
    color: 'var(--color-brand-charcoal)', marginBottom: '6px',
  };

  return (
    <main style={{ backgroundColor: '#FAF8F5', minHeight: '100vh', paddingTop: '40px', paddingBottom: '80px' }}>
      <div className="checkout-container" style={{ maxWidth: '1200px', margin: '0 auto' }}>

        <div style={{ marginBottom: '32px' }}>
          <Link href="/cart" style={{ fontFamily: 'var(--font-body)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-brand-charcoal)', opacity: 0.5, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            ← Back to Bag
          </Link>
        </div>

        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 4vw, 3.5rem)', fontWeight: 300, color: 'var(--color-brand-charcoal)', marginBottom: '40px' }}>
          Checkout
        </h1>

        {items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 24px' }}>
            <p style={{ fontFamily: 'var(--font-body)', color: 'var(--color-brand-charcoal)', opacity: 0.6 }}>Your bag is empty.</p>
            <Link href="/collection" style={{ display: 'inline-block', marginTop: '24px', padding: '14px 32px', backgroundColor: 'var(--color-brand-charcoal)', color: '#fff', borderRadius: '4px', textDecoration: 'none', fontFamily: 'var(--font-body)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 600 }}>
              Explore Collection
            </Link>
          </div>
        ) : (
          <div className="checkout-grid" style={{ alignItems: 'start' }}>

            {/* ── LEFT: Shipping Form ──────────────────────────────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>

              <section style={{ padding: '32px', backgroundColor: 'var(--glass-bg)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--color-brand-charcoal)', marginBottom: '24px' }}>
                  Shipping Details
                </h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Full Name *</label>
                    <input style={inputStyle} value={form.fullName} onChange={handleField('fullName')} placeholder="Priya Sharma" />
                    <FieldError msg={errors.fullName} />
                  </div>

                  <div className="checkout-field-row">
                    <div>
                      <label style={labelStyle}>Email *</label>
                      <input style={inputStyle} type="email" value={form.email} onChange={handleField('email')} placeholder="priya@example.com" />
                      <FieldError msg={errors.email} />
                    </div>
                    <div>
                      <label style={labelStyle}>Phone *</label>
                      <input style={inputStyle} type="tel" value={form.phone} onChange={handleField('phone')} placeholder="+91 98765 43210" />
                      <FieldError msg={errors.phone} />
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>Address Line 1 *</label>
                    <input style={inputStyle} value={form.line1} onChange={handleField('line1')} placeholder="House / Flat No, Street Name" />
                    <FieldError msg={errors.line1} />
                  </div>

                  <div>
                    <label style={labelStyle}>Address Line 2</label>
                    <input style={inputStyle} value={form.line2} onChange={handleField('line2')} placeholder="Landmark, Area (optional)" />
                  </div>

                  <div className="checkout-field-row">
                    <div>
                      <label style={labelStyle}>City *</label>
                      <input style={inputStyle} value={form.city} onChange={handleField('city')} placeholder="Jaipur" />
                      <FieldError msg={errors.city} />
                    </div>
                    <div>
                      <label style={labelStyle}>State *</label>
                      <input style={inputStyle} value={form.state} onChange={handleField('state')} placeholder="Rajasthan" />
                      <FieldError msg={errors.state} />
                    </div>
                  </div>

                  <div className="checkout-field-row">
                    <div>
                      <label style={labelStyle}>Pincode *</label>
                      <input style={inputStyle} value={form.pincode} onChange={handleField('pincode')} placeholder="302001" maxLength={10} />
                      <FieldError msg={errors.pincode} />
                    </div>
                    <div>
                      <label style={labelStyle}>Country</label>
                      <input style={inputStyle} value={form.country} onChange={handleField('country')} placeholder="India" />
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* ── RIGHT: Order Summary ─────────────────────────────────────── */}
            <div className="checkout-summary">
              <div style={{ padding: '32px', backgroundColor: 'var(--glass-bg)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: '16px', border: '1px solid var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--color-brand-charcoal)', marginBottom: '24px' }}>
                  Order Summary
                </h2>

                {/* Items */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                  {items.map((item) => (
                    <div key={`${item.productId}-${item.size}`} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <div style={{ width: '48px', height: '60px', borderRadius: '6px', overflow: 'hidden', backgroundColor: 'var(--color-brand-blush)', flexShrink: 0 }}>
                        <img src={localResize(item.imageUrl || '/prod-bestseller.webp', 120)} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 500, color: 'var(--color-brand-charcoal)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--color-brand-charcoal)', opacity: 0.6, margin: 0 }}>Size: {item.size} · Qty: {item.quantity}</p>
                      </div>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 600, color: 'var(--color-brand-charcoal)', flexShrink: 0 }}>{fmt(item.priceINR * item.quantity)}</span>
                    </div>
                  ))}
                </div>

                <div style={{ width: '100%', height: '1px', backgroundColor: 'var(--color-brand-mist)', marginBottom: '20px' }} />

                {/* Coupon */}
                <div style={{ marginBottom: '20px' }}>
                  {appliedCode ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--color-brand-blush)', borderRadius: '8px', padding: '12px 16px', border: '1px solid var(--color-brand-blush-deep)' }}>
                      <div>
                        <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600, color: 'var(--color-brand-charcoal)' }}>{appliedCode}</p>
                        <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: '10px', color: 'var(--color-brand-charcoal)', opacity: 0.6 }}>
                          −{fmt(discountINR)} discount applied
                        </p>
                      </div>
                      <button onClick={() => { setAppliedCode(null); setDiscountINR(0); }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, color: 'var(--color-brand-charcoal)', opacity: 0.6, padding: '6px 4px' }}>
                        Remove
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleApplyCoupon} style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text" placeholder="Coupon Code" value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value)} disabled={isApplying}
                        style={{ flex: 1, padding: '10px 14px', borderRadius: '4px', border: '1px solid var(--color-brand-mist)', backgroundColor: 'rgba(255,255,255,0.6)', color: 'var(--color-brand-charcoal)', fontFamily: 'var(--font-body)', fontSize: '12px', outline: 'none', textTransform: 'uppercase' }}
                      />
                      <button type="submit" disabled={isApplying || !couponCode.trim()} style={{ padding: '10px 16px', backgroundColor: 'var(--color-brand-charcoal)', color: '#fff', borderRadius: '4px', border: 'none', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.15em', cursor: 'pointer', opacity: (!couponCode.trim() || isApplying) ? 0.5 : 1 }}>
                        {isApplying ? '...' : 'Apply'}
                      </button>
                    </form>
                  )}
                  {couponError && <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#C0392B', fontFamily: 'var(--font-body)' }}>{couponError}</p>}
                </div>

                {/* Totals */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--color-brand-charcoal)', opacity: 0.7 }}>
                    <span>Subtotal</span><span style={{ fontWeight: 500 }}>{fmt(subtotalINR)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--color-brand-charcoal)', opacity: 0.7 }}>
                    <span>Shipping</span>
                    <span style={{ fontWeight: 500 }}>
                      {shippingStatus === 'loading' ? (
                        <span style={{ opacity: 0.6, fontSize: '12px' }}>Calculating…</span>
                      ) : shippingINR === null ? (
                        <span style={{ opacity: 0.6, fontSize: '11px' }}>Enter pincode to calculate</span>
                      ) : shippingINR === 0 ? (
                        <span style={{ color: 'var(--color-brand-gold)', fontWeight: 600 }}>Free</span>
                      ) : fmt(shippingINR)}
                    </span>
                  </div>
                  {discountINR > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--color-brand-gold)', fontWeight: 600 }}>
                      <span>Discount</span><span>−{fmt(discountINR)}</span>
                    </div>
                  )}
                  <div style={{ width: '100%', height: '1px', backgroundColor: 'var(--color-brand-mist)' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '15px', fontWeight: 600, color: 'var(--color-brand-charcoal)' }}>Total</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 300, color: 'var(--color-brand-charcoal)' }}>{fmt(totalINR)}</span>
                  </div>
                </div>

                {submitError && (
                  <div style={{ padding: '12px 16px', backgroundColor: '#FEF2F2', borderRadius: '8px', border: '1px solid #FCA5A5', marginBottom: '16px' }}>
                    <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: '12px', color: '#C0392B' }}>{submitError}</p>
                  </div>
                )}

                <motion.button
                  onClick={handlePay}
                  disabled={isSubmitting}
                  whileTap={{ scale: 0.97 }}
                  style={{ width: '100%', padding: '18px 24px', backgroundColor: isSubmitting ? 'var(--color-brand-charcoal-soft)' : 'var(--color-brand-charcoal)', color: '#fff', border: 'none', borderRadius: '4px', cursor: isSubmitting ? 'wait' : 'pointer', fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', transition: 'background-color 0.3s' }}
                >
                  {isSubmitting ? 'Processing…' : `Pay ${fmt(totalINR)} Securely`}
                </motion.button>

                <p style={{ marginTop: '16px', textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: '10px', color: 'var(--color-brand-charcoal)', opacity: 0.4, letterSpacing: '0.05em' }}>
                  ✦ Powered by Razorpay · 256-bit SSL
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
