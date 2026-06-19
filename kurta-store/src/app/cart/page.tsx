'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '@/components/providers/CartProvider';
import { useCurrency } from '@/components/providers/CurrencyProvider';

export default function CartPage() {
  const { items, updateQuantity, removeItem, subtotalINR } = useCart();
  const { currency, convertPrice } = useCurrency();

  // Coupon state
  const [couponCode, setCouponCode] = useState('');
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [couponError, setCouponError] = useState('');
  const [couponSuccess, setCouponSuccess] = useState('');
  const [isApplying, setIsApplying] = useState(false);

  // Price formatting helper matching HomeClient
  const fmt = useCallback((priceINR: number) => {
    const c = convertPrice(priceINR);
    const sym: Record<string, string> = { INR: '₹', USD: '$', EUR: '€' };
    return `${sym[currency] ?? ''}${c.toFixed(currency === 'INR' ? 0 : 2)}`;
  }, [convertPrice, currency]);

  // Shipping calculation (Free over ₹2000 INR)
  const shippingINR = subtotalINR >= 2000 || subtotalINR === 0 ? 0 : 150;
  
  // Coupon discount calculation
  const discountINR = subtotalINR * (discountPercent / 100);
  
  // Grand total in INR
  const totalINR = Math.max(0, subtotalINR - discountINR + shippingINR);

  // Apply coupon handler
  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCode.trim()) return;

    setIsApplying(true);
    setCouponError('');
    setCouponSuccess('');

    try {
      const res = await fetch('/api/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponCode }),
      });
      const data = await res.json();

      if (res.ok) {
        setDiscountPercent(data.discountPercent);
        setAppliedCode(couponCode.toUpperCase().trim());
        setCouponSuccess(`Coupon code "${couponCode.toUpperCase().trim()}" applied! (${data.discountPercent}% Off)`);
        setCouponCode('');
      } else {
        setCouponError(data.error ?? 'Invalid coupon code');
      }
    } catch {
      setCouponError('Failed to validate coupon code. Please try again.');
    } finally {
      setIsApplying(false);
    }
  };

  // Remove coupon handler
  const handleRemoveCoupon = () => {
    setAppliedCode(null);
    setDiscountPercent(0);
    setCouponSuccess('');
    setCouponError('');
  };

  return (
    <main style={{ backgroundColor: '#FAF8F5', minHeight: '100vh', paddingTop: '40px', paddingBottom: '80px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 48px' }}>
        
        {/* Navigation Breadcrumb */}
        <div style={{ marginBottom: '32px' }}>
          <Link 
            href="/" 
            className="text-[10px] uppercase tracking-[0.2em] font-semibold transition-colors font-body flex items-center gap-3 group"
            style={{ textDecoration: 'none', display: 'inline-flex', color: 'var(--color-brand-charcoal)', opacity: 0.6 }}
          >
            <span className="w-4 h-px group-hover:w-8 transition-all duration-300" style={{ backgroundColor: 'var(--color-brand-charcoal)', opacity: 0.3 }}></span>
            Back to store
          </Link>
        </div>

        <h1 
          style={{ 
            fontFamily: 'var(--font-display)', 
            fontSize: 'clamp(2rem, 4vw, 3.5rem)', 
            fontWeight: 300, 
            color: 'var(--color-brand-charcoal)', 
            marginBottom: '40px' 
          }}
        >
          Shopping Bag
        </h1>

        <AnimatePresence mode="wait">
          {items.length === 0 ? (
            <motion.div 
              key="empty"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{ 
                textAlign: 'center', 
                padding: '80px 24px', 
                backgroundColor: '#ffffff', 
                borderRadius: '16px', 
                border: '1px solid #E6E2D8',
                boxShadow: '0 8px 30px rgba(0,0,0,0.02)'
              }}
            >
              <div 
                style={{ 
                  fontSize: '48px', 
                  marginBottom: '24px', 
                  color: 'var(--color-brand-gold-light)' 
                }}
              >
                ✦
              </div>
              <h2 
                style={{ 
                  fontFamily: 'var(--font-display)', 
                  fontSize: '2rem', 
                  fontWeight: 300, 
                  color: '#0F2A5B',
                  marginBottom: '16px'
                }}
              >
                Your bag is empty
              </h2>
              <p 
                style={{ 
                  fontFamily: 'var(--font-body)', 
                  color: 'rgba(15,42,91,0.6)', 
                  fontSize: '14px', 
                  maxWidth: '380px', 
                  margin: '0 auto 32px',
                  lineHeight: 1.7
                }}
              >
                Curate your personal collection of artisanal weaves and premium Indian wear.
              </p>
              <Link 
                href="/#collection" 
                className="btn-liquid"
                style={{ 
                  display: 'inline-block',
                  backgroundColor: '#0F2A5B', 
                  color: '#ffffff', 
                  fontSize: '10px', 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.2em', 
                  fontWeight: 600, 
                  padding: '16px 40px', 
                  borderRadius: '4px', 
                  textDecoration: 'none',
                  transition: 'background-color 0.3s ease'
                }}
              >
                Explore Collection
              </Link>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '32px' }}>
              
              {/* Left Column: Cart Items */}
              <div className="lg:col-span-8" style={{ gridColumn: 'span 12', '@media (min-width: 1024px)': { gridColumn: 'span 8' } } as any}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <AnimatePresence>
                    {items.map((item) => (
                      <motion.div
                        key={`${item.productId}-${item.size}`}
                        layout
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -100 }}
                        transition={{ duration: 0.35, ease: 'easeInOut' }}
                        style={{
                          display: 'flex',
                          gap: '24px',
                          padding: '24px',
                          backgroundColor: 'var(--glass-bg)',
                          backdropFilter: 'blur(20px)',
                          WebkitBackdropFilter: 'blur(20px)',
                          borderRadius: '16px',
                          border: '1px solid var(--glass-border)',
                          boxShadow: 'var(--glass-shadow)'
                        }}
                      >
                        {/* Product Image */}
                        <div 
                          style={{ 
                            position: 'relative', 
                            width: '100px', 
                            height: '133px', 
                            borderRadius: '8px', 
                            overflow: 'hidden', 
                            backgroundColor: 'rgba(0,0,0,0.05)',
                            flexShrink: 0
                          }}
                        >
                          <img 
                            src={item.imageUrl || '/prod-bestseller.webp'} 
                            alt={item.title}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </div>

                        {/* Product Details */}
                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1 }}>
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                              <h3 
                                style={{ 
                                  fontFamily: 'var(--font-display)', 
                                  fontSize: '1.25rem', 
                                  color: 'var(--color-brand-charcoal)', 
                                  fontWeight: 400,
                                  margin: 0
                                }}
                              >
                                {item.title}
                              </h3>
                              <p 
                                style={{ 
                                  fontFamily: 'var(--font-body)', 
                                  fontWeight: 600, 
                                  color: 'var(--color-brand-charcoal)', 
                                  fontSize: '14px',
                                  margin: 0
                                }}
                              >
                                {fmt(item.priceINR)}
                              </p>
                            </div>
                            
                            <p 
                              style={{ 
                                fontFamily: 'var(--font-body)', 
                                fontSize: '11px', 
                                textTransform: 'uppercase', 
                                letterSpacing: '0.1em', 
                                color: 'var(--color-brand-charcoal)',
                                opacity: 0.5,
                                marginTop: '6px',
                                marginBottom: 0 
                              }}
                            >
                              Size: <span style={{ fontWeight: 600, color: 'var(--color-brand-charcoal)' }}>{item.size}</span>
                            </p>
                          </div>

                          {/* Controls (Quantity + Delete) */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                            {/* Quantity Adjustment Pill */}
                            <div 
                              style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                border: '1px solid var(--glass-border)', 
                                borderRadius: '100px', 
                                padding: '4px',
                                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                                backdropFilter: 'blur(8px)',
                                WebkitBackdropFilter: 'blur(8px)',
                              }}
                            >
                              <button
                                onClick={() => updateQuantity(item.productId, item.size, item.quantity - 1)}
                                style={{
                                  border: 'none',
                                  background: 'none',
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '50%',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '14px',
                                  color: 'var(--color-brand-charcoal)',
                                  transition: 'background-color 0.2s'
                                }}
                                className="hover:bg-white/40"
                                aria-label="Decrease quantity"
                              >
                                ─
                              </button>
                              
                              <span 
                                style={{ 
                                  padding: '0 12px', 
                                  fontFamily: 'var(--font-mono)', 
                                  fontSize: '13px', 
                                  fontWeight: 500,
                                  color: 'var(--color-brand-charcoal)',
                                  minWidth: '24px',
                                  textAlign: 'center'
                                }}
                              >
                                {item.quantity}
                              </span>

                              <button
                                onClick={() => updateQuantity(item.productId, item.size, item.quantity + 1)}
                                style={{
                                  border: 'none',
                                  background: 'none',
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '50%',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '14px',
                                  color: 'var(--color-brand-charcoal)',
                                  transition: 'background-color 0.2s'
                                }}
                                className="hover:bg-white/40"
                                aria-label="Increase quantity"
                              >
                                ＋
                              </button>
                            </div>

                            {/* Remove Item */}
                            <button
                              onClick={() => removeItem(item.productId, item.size)}
                              style={{
                                border: 'none',
                                background: 'none',
                                cursor: 'pointer',
                                padding: '8px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontFamily: 'var(--font-body)',
                                fontSize: '10px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.15em',
                                fontWeight: 500,
                                color: 'var(--color-brand-charcoal)',
                                opacity: 0.5,
                                transition: 'color 0.2s, opacity 0.2s'
                              }}
                              className="hover:text-red-700 hover:opacity-100"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>

              {/* Right Column: Order Summary Card */}
              <div className="lg:col-span-4" style={{ gridColumn: 'span 12', '@media (min-width: 1024px)': { gridColumn: 'span 4' } } as any}>
                <div 
                  style={{ 
                    backgroundColor: 'var(--glass-bg)', 
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    borderRadius: '16px', 
                    border: '1px solid var(--glass-border)', 
                    padding: '32px',
                    position: 'sticky',
                    top: '112px',
                    boxShadow: 'var(--glass-shadow)'
                  }}
                >
                  <h2 
                    style={{ 
                      fontFamily: 'var(--font-display)', 
                      fontSize: '1.5rem', 
                      fontWeight: 400, 
                      color: 'var(--color-brand-charcoal)',
                      marginBottom: '24px'
                    }}
                  >
                    Order Summary
                  </h2>

                  {/* Calculations */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontFamily: 'var(--font-body)', color: 'var(--color-brand-charcoal)', opacity: 0.7 }}>
                      <span>Subtotal</span>
                      <span style={{ fontWeight: 500, color: 'var(--color-brand-charcoal)' }}>{fmt(subtotalINR)}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontFamily: 'var(--font-body)', color: 'var(--color-brand-charcoal)', opacity: 0.7 }}>
                      <span>Shipping</span>
                      <span style={{ fontWeight: 500, color: 'var(--color-brand-charcoal)' }}>
                        {shippingINR === 0 ? (
                          <span style={{ color: 'var(--color-brand-gold)', fontWeight: 600 }}>Free</span>
                        ) : (
                          fmt(shippingINR)
                        )}
                      </span>
                    </div>

                    <AnimatePresence>
                      {discountPercent > 0 && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontFamily: 'var(--font-body)', color: 'var(--color-brand-gold)' }}
                        >
                          <span>Discount ({appliedCode})</span>
                          <span style={{ fontWeight: 600 }}>-{fmt(discountINR)}</span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div style={{ width: '100%', height: '1px', backgroundColor: 'var(--glass-border)', marginBottom: '20px' }} />

                  {/* Total */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '32px' }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '15px', fontWeight: 600, color: 'var(--color-brand-charcoal)' }}>Total</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 300, color: 'var(--color-brand-charcoal)' }}>
                      {fmt(totalINR)}
                    </span>
                  </div>

                  {/* Coupon Form */}
                  <div style={{ marginBottom: '32px' }}>
                    {appliedCode ? (
                      <div 
                        style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          backgroundColor: 'var(--color-brand-blush)', 
                          borderRadius: '8px', 
                          padding: '12px 16px',
                          border: '1px solid var(--color-brand-blush-deep)'
                        }}
                      >
                        <div>
                          <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600, color: 'var(--color-brand-charcoal)' }}>
                            {appliedCode}
                          </p>
                          <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: '10px', color: 'var(--color-brand-charcoal)', opacity: 0.6 }}>
                            {discountPercent}% discount applied
                          </p>
                        </div>
                        <button 
                          onClick={handleRemoveCoupon}
                          style={{ 
                            border: 'none', 
                            background: 'none', 
                            color: 'var(--color-brand-charcoal)',
                            opacity: 0.6,
                            fontSize: '10px', 
                            textTransform: 'uppercase', 
                            letterSpacing: '0.1em',
                            cursor: 'pointer',
                            fontWeight: 600
                          }}
                          className="hover:opacity-100"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={handleApplyCoupon} style={{ display: 'flex', gap: '8px' }}>
                        <input 
                          type="text"
                          placeholder="Coupon Code"
                          value={couponCode}
                          onChange={(e) => setCouponCode(e.target.value)}
                          disabled={isApplying}
                          style={{
                            flex: 1,
                            padding: '12px 16px',
                            borderRadius: '4px',
                            border: '1px solid var(--glass-border)',
                            backgroundColor: 'rgba(255, 255, 255, 0.1)',
                            color: 'var(--color-brand-charcoal)',
                            fontSize: '12px',
                            fontFamily: 'var(--font-body)',
                            outline: 'none',
                            textTransform: 'uppercase'
                          }}
                        />
                        <button 
                          type="submit"
                          disabled={isApplying || !couponCode.trim()}
                          style={{
                            padding: '12px 20px',
                            backgroundColor: 'var(--color-brand-charcoal)',
                            color: '#ffffff',
                            borderRadius: '4px',
                            border: 'none',
                            fontSize: '10px',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: '0.15em',
                            cursor: 'pointer',
                            opacity: (!couponCode.trim() || isApplying) ? 0.5 : 1,
                            transition: 'background-color 0.2s'
                          }}
                        >
                          {isApplying ? '...' : 'Apply'}
                        </button>
                      </form>
                    )}

                    {couponError && (
                      <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#C0392B', fontFamily: 'var(--font-body)' }}>
                        {couponError}
                      </p>
                    )}
                    {couponSuccess && (
                      <p style={{ margin: '8px 0 0', fontSize: '11px', color: 'var(--color-brand-gold)', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                        {couponSuccess}
                      </p>
                    )}
                  </div>

                  {/* Checkout CTA */}
                  <button
                    className="btn-liquid"
                    style={{
                      width: '100%',
                      padding: '18px 24px',
                      backgroundColor: 'var(--color-brand-charcoal)',
                      color: '#ffffff',
                      borderRadius: '4px',
                      border: 'none',
                      fontSize: '11px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.2em',
                      cursor: 'pointer',
                      transition: 'background-color 0.3s'
                    }}
                  >
                    Proceed to Checkout
                  </button>

                  <div style={{ marginTop: '20px', textAlign: 'center' }}>
                    <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: '10px', color: 'var(--color-brand-charcoal)', opacity: 0.4, letterSpacing: '0.05em' }}>
                      ✦ Secure transaction processed in INR
                    </p>
                  </div>
                </div>
              </div>

            </div>
          )}
        </AnimatePresence>

      </div>
    </main>
  );
}
