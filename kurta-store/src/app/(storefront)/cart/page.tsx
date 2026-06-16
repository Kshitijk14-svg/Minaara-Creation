'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { useCart } from '@/components/providers/CartProvider';
import { useCurrency } from '@/components/providers/CurrencyProvider';
import { trackPurchase } from '@/lib/analytics';
import { MagneticLink } from '@/components/ui/MagneticLink';

interface CouponState {
  code: string;
  discountPercent: number | null;
  error: string | null;
  isLoading: boolean;
}

const emptyBagVariants = {
  hidden: { opacity: 0, y: 32 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { ease: [0.22, 1, 0.36, 1], duration: 0.6 },
  },
};

const toastVariants = {
  hidden: { opacity: 0, y: -20, x: '-50%' },
  visible: { opacity: 1, y: 0, x: '-50%', transition: { ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: -20, x: '-50%', transition: { ease: 'easeIn', duration: 0.2 } },
};

export default function CartPage() {
  const { items, removeItem, updateQuantity, clear, subtotalINR } = useCart();
  const { currency, convertPrice } = useCurrency();

  const [coupon, setCoupon] = useState<CouponState>({
    code: '',
    discountPercent: null,
    error: null,
    isLoading: false,
  });
  const [checkoutForm, setCheckoutForm] = useState({
    email: '',
    phone: '',
    fullName: '',
    line1: '',
    city: '',
    state: '',
    pincode: '',
  });
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const formatPrice = useCallback(
    (priceINR: number) => {
      const converted = convertPrice(priceINR);
      const symbols: Record<string, string> = { INR: '₹', USD: '$', EUR: '€' };
      return `${symbols[currency] ?? ''}${converted.toFixed(currency === 'INR' ? 0 : 2)}`;
    },
    [convertPrice, currency],
  );

  const discountAmount = coupon.discountPercent ? subtotalINR * (coupon.discountPercent / 100) : 0;
  const totalINR = subtotalINR - discountAmount;

  const handleApplyCoupon = useCallback(async () => {
    if (!coupon.code.trim()) return;
    setCoupon((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const res = await fetch('/api/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: coupon.code }),
      });
      const data = (await res.json()) as { discountPercent?: number; error?: string };
      if (!res.ok) {
        setCoupon((prev) => ({ ...prev, isLoading: false, error: data.error ?? 'Invalid coupon' }));
      } else {
        setCoupon((prev) => ({ ...prev, isLoading: false, discountPercent: data.discountPercent ?? null, error: null }));
        showToast(`Coupon applied! ${data.discountPercent}% off`, 'success');
      }
    } catch {
      setCoupon((prev) => ({ ...prev, isLoading: false, error: 'Failed to validate coupon' }));
    }
  }, [coupon.code, showToast]);

  const handleCheckout = useCallback(async () => {
    if (items.length === 0) return;
    if (!checkoutForm.email || !checkoutForm.phone || !checkoutForm.fullName || !checkoutForm.line1) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    setIsCheckingOut(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerEmail: checkoutForm.email,
          customerPhone: checkoutForm.phone,
          shippingAddress: {
            fullName: checkoutForm.fullName,
            line1: checkoutForm.line1,
            city: checkoutForm.city,
            state: checkoutForm.state,
            pincode: checkoutForm.pincode,
            country: 'India',
          },
          items: items.map((i) => ({
            productId: i.productId,
            title: i.title,
            size: i.size,
            quantity: i.quantity,
            priceINR: i.priceINR,
          })),
          totalAmountINR: totalINR,
          currency,
        }),
      });

      const data = (await res.json()) as { orderId?: string; error?: string };
      if (!res.ok) {
        showToast(data.error ?? 'Failed to place order', 'error');
      } else {
        trackPurchase(data.orderId!, items, totalINR);
        setOrderSuccess(data.orderId!);
        clear();
      }
    } catch {
      showToast('Something went wrong. Please try again.', 'error');
    } finally {
      setIsCheckingOut(false);
    }
  }, [items, checkoutForm, totalINR, currency, clear, showToast]);

  // Order success state
  if (orderSuccess) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
        style={{ backgroundColor: 'var(--color-brand-ivory)' }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.88 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ease: [0.22, 1, 0.36, 1], duration: 0.6 }}
        >
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-8"
            style={{
              background: 'linear-gradient(135deg, var(--color-brand-mauve), var(--color-brand-mauve-deep))',
              boxShadow: '0 12px 40px rgba(196,154,138,0.35)',
            }}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M8 16L13 21L24 10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--color-brand-mauve)' }}>
            Order Confirmed
          </p>
          <h1
            className="text-4xl mb-3"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--color-brand-charcoal)', fontWeight: 300, fontStyle: 'italic' }}
          >
            Order Placed!
          </h1>
          <p style={{ color: 'var(--color-brand-charcoal)', opacity: 0.5, fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
            Order ID:{' '}
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-brand-gold)' }}>
              {orderSuccess.slice(0, 8).toUpperCase()}
            </span>
          </p>
          <Link
            href="/"
            className="inline-block mt-8 px-8 py-3.5 text-xs uppercase tracking-widest rounded-md"
            style={{ backgroundColor: 'var(--color-brand-charcoal)', color: 'white', fontFamily: 'var(--font-body)' }}
            id="order-success-cta"
          >
            Continue Shopping
          </Link>
        </motion.div>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    border: '1px solid var(--color-brand-mist)',
    borderRadius: '10px',
    backgroundColor: 'white',
    fontFamily: 'var(--font-body)',
    fontSize: '0.875rem',
    color: 'var(--color-brand-charcoal)',
    outline: 'none',
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
  };

  return (
    <>
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="fixed top-6 left-1/2 z-50 px-5 py-3 rounded-xl text-sm shadow-2xl"
            style={{
              backgroundColor: toast.type === 'success' ? 'var(--color-brand-charcoal)' : '#C0392B',
              color: 'white',
              fontFamily: 'var(--font-body)',
              minWidth: '220px',
              textAlign: 'center',
            }}
            variants={toastVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation */}
      <nav
        className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-6 md:px-12 py-4"
        style={{
          backgroundColor: 'rgba(250, 247, 244, 0.88)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(232, 224, 217, 0.6)',
        }}
      >
        <MagneticLink as="div" strength={0.2}>
          <Link
            href="/"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.45rem',
              color: 'var(--color-brand-charcoal)',
              fontStyle: 'italic',
              letterSpacing: '0.02em',
            }}
          >
            Minaara Creation
          </Link>
        </MagneticLink>
        <MagneticLink as="div">
          <Link
            href="/"
            className="text-xs uppercase tracking-widest transition-opacity"
            style={{ color: 'var(--color-brand-charcoal)', opacity: 0.6 }}
          >
            ← Collection
          </Link>
        </MagneticLink>
      </nav>

      <main
        className="pt-20 min-h-screen px-6 md:px-12 pb-16"
        style={{ backgroundColor: 'var(--color-brand-ivory)' }}
      >
        <div className="max-w-6xl mx-auto">
          {/* Page Header */}
          <div className="py-10 border-b mb-8" style={{ borderColor: 'var(--color-brand-mist)' }}>
            <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--color-brand-mauve)' }}>
              Your Selection
            </p>
            <h1
              className="text-4xl md:text-5xl"
              style={{
                fontFamily: 'var(--font-display)',
                color: 'var(--color-brand-charcoal)',
                fontWeight: 300,
                fontStyle: 'italic',
              }}
            >
              Your Cart
              {items.length > 0 && (
                <span
                  style={{
                    fontSize: '1.1rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-brand-mauve)',
                    marginLeft: '1rem',
                    fontStyle: 'normal',
                    opacity: 0.8,
                  }}
                >
                  ({items.length})
                </span>
              )}
            </h1>
          </div>

          {/* Empty Cart */}
          {items.length === 0 ? (
            <motion.div
              className="flex flex-col items-center justify-center py-28 text-center"
              variants={emptyBagVariants}
              initial="hidden"
              animate="visible"
            >
              <div
                className="mb-8 flex items-center justify-center"
                style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  border: '1px solid var(--color-brand-blush-deep)',
                  backgroundColor: 'var(--color-brand-blush)',
                }}
              >
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <rect x="4" y="9" width="24" height="19" rx="3" stroke="var(--color-brand-mauve)" strokeWidth="1.5" />
                  <path d="M11 9V7C11 4.791 12.791 3 15 3h2c2.209 0 4 1.791 4 4v2" stroke="var(--color-brand-mauve)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <h2
                className="text-2xl mb-3"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--color-brand-charcoal)', fontStyle: 'italic' }}
              >
                Your bag is empty
              </h2>
              <p className="mb-8 text-sm" style={{ color: 'var(--color-brand-charcoal)', opacity: 0.5, fontFamily: 'var(--font-body)', maxWidth: '28ch' }}>
                Discover our curated collection and find something beautiful.
              </p>
              <Link
                href="/"
                className="px-8 py-3.5 text-xs uppercase tracking-widest rounded-md transition-all duration-300"
                style={{ backgroundColor: 'var(--color-brand-mauve)', color: 'white', fontFamily: 'var(--font-body)' }}
                id="empty-cart-explore-cta"
              >
                Explore Collection
              </Link>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
              {/* Cart Items */}
              <div className="lg:col-span-3 space-y-4">
                <AnimatePresence>
                  {items.map((item) => (
                    <motion.div
                      key={`${item.productId}-${item.size}`}
                      layout
                      initial={{ opacity: 0, x: -24 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 24, height: 0, marginBottom: 0, overflow: 'hidden' }}
                      transition={{ ease: [0.22, 1, 0.36, 1], duration: 0.35 }}
                      className="flex gap-5 rounded-2xl p-5"
                      style={{
                        backgroundColor: 'white',
                        border: '1px solid var(--color-brand-mist)',
                        boxShadow: '0 2px 12px rgba(44,44,44,0.04)',
                      }}
                    >
                      {/* Image */}
                      <div
                        className="relative w-24 h-28 flex-shrink-0 rounded-xl overflow-hidden"
                        style={{ backgroundColor: 'var(--color-brand-blush)' }}
                      >
                        {item.imageUrl && (
                          <Image
                            src={item.imageUrl}
                            alt={item.title}
                            fill
                            className="object-cover"
                            sizes="96px"
                          />
                        )}
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <h3
                          className="text-base truncate mb-1"
                          style={{ fontFamily: 'var(--font-display)', color: 'var(--color-brand-charcoal)', fontStyle: 'italic' }}
                        >
                          {item.title}
                        </h3>
                        <p className="text-xs mb-1" style={{ color: 'var(--color-brand-charcoal)', opacity: 0.5, fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          Size: {item.size}
                        </p>
                        <p
                          className="text-sm mt-2"
                          style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-brand-gold)' }}
                        >
                          {formatPrice(item.priceINR * item.quantity)}
                        </p>
                      </div>

                      {/* Quantity + Remove */}
                      <div className="flex flex-col items-end justify-between">
                        <button
                          onClick={() => removeItem(item.productId, item.size)}
                          className="text-xs opacity-30 hover:opacity-60 transition-opacity"
                          style={{ color: 'var(--color-brand-charcoal)', fontFamily: 'var(--font-body)', letterSpacing: '0.05em', textTransform: 'uppercase' }}
                          aria-label={`Remove ${item.title} from cart`}
                        >
                          Remove
                        </button>
                        <div
                          className="flex items-center rounded-lg overflow-hidden"
                          style={{ border: '1px solid var(--color-brand-mist)' }}
                        >
                          <button
                            onClick={() => updateQuantity(item.productId, item.size, item.quantity - 1)}
                            className="w-8 h-8 flex items-center justify-center text-sm transition-all hover:bg-gray-50"
                            style={{ color: 'var(--color-brand-charcoal)' }}
                            aria-label="Decrease quantity"
                          >
                            −
                          </button>
                          <span
                            className="w-8 h-8 flex items-center justify-center text-sm"
                            style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-brand-charcoal)', borderLeft: '1px solid var(--color-brand-mist)', borderRight: '1px solid var(--color-brand-mist)' }}
                          >
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.productId, item.size, item.quantity + 1)}
                            className="w-8 h-8 flex items-center justify-center text-sm transition-all hover:bg-gray-50"
                            style={{ color: 'var(--color-brand-charcoal)' }}
                            aria-label="Increase quantity"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* Order Summary */}
              <div className="lg:col-span-2 space-y-5">
                {/* Coupon */}
                <div
                  className="rounded-2xl p-5"
                  style={{
                    backgroundColor: 'white',
                    border: '1px solid var(--color-brand-mist)',
                    boxShadow: '0 2px 12px rgba(44,44,44,0.04)',
                  }}
                >
                  <p className="text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--color-brand-charcoal)', opacity: 0.6 }}>
                    Promo Code
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="WELCOME10"
                      value={coupon.code}
                      onChange={(e) => setCoupon((prev) => ({ ...prev, code: e.target.value }))}
                      style={{
                        ...inputStyle,
                        flex: 1,
                        padding: '10px 12px',
                        fontSize: '0.8rem',
                      }}
                      id="coupon-input"
                      aria-label="Enter coupon code"
                    />
                    <button
                      onClick={handleApplyCoupon}
                      disabled={coupon.isLoading || !coupon.code.trim()}
                      className="px-4 py-2 text-xs uppercase tracking-wider rounded-xl transition-all disabled:opacity-40"
                      style={{
                        backgroundColor: 'var(--color-brand-charcoal)',
                        color: 'white',
                        fontFamily: 'var(--font-body)',
                        whiteSpace: 'nowrap',
                      }}
                      id="apply-coupon-btn"
                    >
                      {coupon.isLoading ? '…' : 'Apply'}
                    </button>
                  </div>
                  {coupon.error && (
                    <p className="mt-2 text-xs" style={{ color: '#C0392B', fontFamily: 'var(--font-body)' }}>{coupon.error}</p>
                  )}
                  {coupon.discountPercent && (
                    <p className="mt-2 text-xs" style={{ color: '#27AE60', fontFamily: 'var(--font-body)' }}>
                      ✓ {coupon.discountPercent}% discount applied
                    </p>
                  )}
                </div>

                {/* Summary Card */}
                <div
                  className="rounded-2xl p-5 space-y-3"
                  style={{
                    backgroundColor: 'white',
                    border: '1px solid var(--color-brand-mist)',
                    boxShadow: '0 2px 12px rgba(44,44,44,0.04)',
                  }}
                >
                  <p className="text-xs uppercase tracking-widest mb-4" style={{ color: 'var(--color-brand-charcoal)', opacity: 0.6 }}>
                    Order Summary
                  </p>
                  <div className="flex justify-between text-sm" style={{ color: 'var(--color-brand-charcoal)' }}>
                    <span style={{ opacity: 0.55, fontFamily: 'var(--font-body)' }}>Subtotal</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{formatPrice(subtotalINR)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-sm" style={{ color: '#27AE60' }}>
                      <span style={{ fontFamily: 'var(--font-body)' }}>Discount ({coupon.discountPercent}%)</span>
                      <span style={{ fontFamily: 'var(--font-mono)' }}>−{formatPrice(discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm" style={{ color: 'var(--color-brand-charcoal)' }}>
                    <span style={{ opacity: 0.55, fontFamily: 'var(--font-body)' }}>Shipping</span>
                    <span style={{ fontFamily: 'var(--font-body)', color: '#27AE60' }}>Free</span>
                  </div>
                  <div
                    style={{
                      height: '1px',
                      background: 'linear-gradient(90deg, transparent, var(--color-brand-mauve), transparent)',
                      margin: '4px 0',
                    }}
                  />
                  <div className="flex justify-between text-base font-medium" style={{ color: 'var(--color-brand-charcoal)' }}>
                    <span style={{ fontFamily: 'var(--font-body)' }}>Total</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-brand-gold)', fontSize: '1.1rem' }}>
                      {formatPrice(totalINR)}
                    </span>
                  </div>
                </div>

                {/* Shipping form */}
                <div
                  className="rounded-2xl p-5 space-y-3"
                  style={{
                    backgroundColor: 'white',
                    border: '1px solid var(--color-brand-mist)',
                    boxShadow: '0 2px 12px rgba(44,44,44,0.04)',
                  }}
                >
                  <p className="text-xs uppercase tracking-widest mb-4" style={{ color: 'var(--color-brand-charcoal)', opacity: 0.6 }}>
                    Shipping Details
                  </p>
                  {[
                    { id: 'checkout-name', key: 'fullName', placeholder: 'Full Name *', type: 'text' },
                    { id: 'checkout-email', key: 'email', placeholder: 'Email Address *', type: 'email' },
                    { id: 'checkout-phone', key: 'phone', placeholder: 'Phone *', type: 'tel' },
                    { id: 'checkout-address', key: 'line1', placeholder: 'Address Line 1 *', type: 'text' },
                    { id: 'checkout-city', key: 'city', placeholder: 'City', type: 'text' },
                    { id: 'checkout-state', key: 'state', placeholder: 'State', type: 'text' },
                    { id: 'checkout-pincode', key: 'pincode', placeholder: 'PIN Code', type: 'text' },
                  ].map((field) => (
                    <input
                      key={field.id}
                      id={field.id}
                      type={field.type}
                      placeholder={field.placeholder}
                      value={checkoutForm[field.key as keyof typeof checkoutForm]}
                      onChange={(e) =>
                        setCheckoutForm((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      style={inputStyle}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-brand-mauve)';
                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(196,154,138,0.15)';
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-brand-mist)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    />
                  ))}
                </div>

                {/* Checkout CTA */}
                <button
                  onClick={handleCheckout}
                  disabled={isCheckingOut || items.length === 0}
                  className="btn-rubberband w-full py-4 text-xs uppercase tracking-widest rounded-2xl transition-all duration-300 disabled:opacity-40"
                  style={{
                    backgroundColor: 'var(--color-brand-charcoal)',
                    color: 'white',
                    fontFamily: 'var(--font-body)',
                    boxShadow: isCheckingOut ? 'none' : '0 8px 24px rgba(44,44,44,0.25)',
                  }}
                  id="proceed-to-checkout-btn"
                >
                  {isCheckingOut ? 'Placing Order…' : 'Proceed to Checkout'}
                </button>

                <p
                  className="text-center text-xs"
                  style={{ color: 'var(--color-brand-charcoal)', opacity: 0.35, fontFamily: 'var(--font-body)' }}
                >
                  Free shipping on all orders · Secure checkout
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
