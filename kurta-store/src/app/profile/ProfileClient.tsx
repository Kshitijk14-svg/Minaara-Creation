'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Order } from '@/types/schema';

type Tab = 'overview' | 'orders' | 'settings';

interface ProfileClientProps {
  session: any;
}

const HomeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

const OrderIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
    <line x1="3" y1="6" x2="21" y2="6"/>
    <path d="M16 10a4 4 0 01-8 0"/>
  </svg>
);

const SettingsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
  </svg>
);

const LogoutIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

const AdminIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
    <line x1="9" y1="3" x2="9" y2="21"/>
    <line x1="9" y1="9" x2="21" y2="9"/>
    <line x1="9" y1="15" x2="21" y2="15"/>
  </svg>
);

const PackageIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
    <line x1="3" y1="6" x2="21" y2="6"/>
    <path d="M16 10a4 4 0 01-8 0"/>
  </svg>
);

function getStatusColor(status: string) {
  switch (status) {
    case 'PAID': return { bg: 'rgba(34, 197, 94, 0.08)', color: '#16a34a', border: 'rgba(34, 197, 94, 0.2)' };
    case 'PENDING': return { bg: 'rgba(166, 128, 38, 0.08)', color: '#A68026', border: 'rgba(166, 128, 38, 0.2)' };
    case 'FAILED': return { bg: 'rgba(220, 38, 38, 0.08)', color: '#dc2626', border: 'rgba(220, 38, 38, 0.2)' };
    default: return { bg: 'rgba(15, 42, 91, 0.06)', color: '#0F2A5B', border: 'rgba(15, 42, 91, 0.12)' };
  }
}

function getInitials(name?: string | null, email?: string | null) {
  if (name) {
    return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  }
  return email ? email[0].toUpperCase() : 'U';
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

function formatCurrency(amount: number, currency: string) {
  const symbols: Record<string, string> = { INR: '₹', USD: '$', EUR: '€' };
  return `${symbols[currency] || '₹'}${amount.toLocaleString('en-IN')}`;
}

export default function ProfileClient({ session }: ProfileClientProps) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const user = session?.user;
  const isAdminUser = ['SUPER_ADMIN', 'ADMIN', 'STAFF'].includes(user?.role);
  const memberSince = session?.expires 
    ? new Date(session.expires).getFullYear()
    : new Date().getFullYear();

  useEffect(() => {
    if (activeTab === 'orders' && user?.email) {
      setOrdersLoading(true);
      fetch(`/api/orders?email=${encodeURIComponent(user.email)}`)
        .then(r => r.json())
        .then(data => setOrders(data.orders || []))
        .catch(console.error)
        .finally(() => setOrdersLoading(false));
    }
  }, [activeTab, user?.email]);

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut({ callbackUrl: '/' });
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <HomeIcon /> },
    { id: 'orders', label: 'Orders', icon: <OrderIcon /> },
    { id: 'settings', label: 'Settings', icon: <SettingsIcon /> },
  ];

  return (
    <main style={{ minHeight: '100vh', backgroundColor: 'var(--color-brand-ivory)', paddingTop: '0', paddingBottom: '80px' }}>
      
      {/* Hero Header */}
      <div style={{
        background: 'linear-gradient(135deg, var(--color-brand-charcoal) 0%, var(--color-brand-mauve) 50%, var(--color-brand-mauve-deep) 100%)',
        padding: '60px 24px 0',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative circles */}
        <div style={{
          position: 'absolute', top: '-60px', right: '-60px',
          width: '280px', height: '280px', borderRadius: '50%',
          background: 'rgba(166, 128, 38, 0.08)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: '-40px', left: '-40px',
          width: '200px', height: '200px', borderRadius: '50%',
          background: 'rgba(255,255,255,0.04)',
          pointerEvents: 'none',
        }} />

        <div style={{ maxWidth: '960px', margin: '0 auto', position: 'relative' }}>
          {/* Breadcrumb */}
          <Link href="/" style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            color: 'rgba(255,255,255,0.5)', textDecoration: 'none',
            fontSize: '10px', fontFamily: 'var(--font-body)', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.2em',
            marginBottom: '32px', transition: 'color 0.2s',
          }}
          className="hover-opacity-full"
          >
            <span style={{ display: 'inline-block', width: '16px', height: '1px', backgroundColor: 'currentColor', opacity: 0.5 }} />
            Store
          </Link>

          {/* Profile Header */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '24px', flexWrap: 'wrap', paddingBottom: '32px' }}>
            {/* Avatar */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              style={{
                width: '72px', height: '72px', borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--color-brand-gold) 0%, var(--color-brand-gold-light) 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '24px', fontFamily: 'var(--font-display)', fontWeight: 500,
                color: '#fff', letterSpacing: '0.04em', flexShrink: 0,
                border: '2px solid rgba(255,255,255,0.15)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
              }}
            >
              {getInitials(user?.name, user?.email)}
            </motion.div>

            <div style={{ flex: 1, minWidth: '200px' }}>
              <motion.h1
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                style={{
                  fontFamily: 'var(--font-display)', fontSize: 'clamp(1.5rem, 4vw, 2.25rem)',
                  fontWeight: 400, color: '#fff', margin: '0 0 4px',
                  letterSpacing: '0.02em',
                }}
              >
                {user?.name || 'Welcome'}
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                style={{
                  fontFamily: 'var(--font-body)', fontSize: '13px',
                  color: 'rgba(255,255,255,0.55)', margin: 0,
                  letterSpacing: '0.02em',
                }}
              >
                {user?.email}
              </motion.p>
            </div>

            {/* Admin Dashboard button */}
            {isAdminUser && (
              <Link href="/admin" style={{ textDecoration: 'none' }}>
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    background: 'linear-gradient(135deg, var(--color-brand-gold) 0%, var(--color-brand-gold-light) 100%)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: '#fff', padding: '10px 18px',
                    borderRadius: '8px', cursor: 'pointer',
                    fontSize: '10px', fontFamily: 'var(--font-body)', fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: '0.15em',
                    transition: 'all 0.2s',
                    boxShadow: '0 4px 12px rgba(166, 128, 38, 0.25)',
                    flexShrink: 0,
                  }}
                  className="profile-admin-btn"
                >
                  <AdminIcon />
                  Admin Dashboard
                </motion.span>
              </Link>
            )}

            {/* Sign Out button */}
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
              onClick={handleSignOut}
              disabled={signingOut}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.65)', padding: '10px 18px',
                borderRadius: '8px', cursor: 'pointer',
                fontSize: '10px', fontFamily: 'var(--font-body)', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.15em',
                transition: 'all 0.2s', opacity: signingOut ? 0.5 : 1,
                flexShrink: 0,
              }}
              className="profile-signout-btn"
            >
              <LogoutIcon />
              {signingOut ? 'Signing out...' : 'Sign Out'}
            </motion.button>
          </div>

          {/* Tab Navigation */}
          <div style={{
            display: 'flex', gap: '0', borderBottom: '1px solid rgba(255,255,255,0.08)',
            marginTop: '8px',
          }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '14px 20px',
                  background: 'none', border: 'none',
                  color: activeTab === tab.id ? '#fff' : 'rgba(255,255,255,0.4)',
                  fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.15em',
                  cursor: 'pointer', transition: 'color 0.2s',
                  borderBottom: activeTab === tab.id ? '2px solid var(--color-brand-gold)' : '2px solid transparent',
                  marginBottom: '-1px',
                }}
              >
                {tab.icon}
                <span className="hidden-sm">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '40px 24px' }}>
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                {[
                  {
                    label: 'Account Status',
                    value: 'Active',
                    sub: user?.role
                      ? user.role.replace('_', ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase())
                      : 'Customer',
                  },
                  { label: 'Email', value: user?.email?.split('@')[0], sub: `@${user?.email?.split('@')[1]}` },
                  { label: 'Member Since', value: memberSince, sub: 'Minaara Family' },
                ].map((stat, i) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.07, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    style={{
                      background: 'var(--glass-bg)',
                      backdropFilter: 'blur(20px)',
                      WebkitBackdropFilter: 'blur(20px)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: '12px',
                      padding: '24px',
                      boxShadow: 'var(--glass-shadow)',
                    }}
                  >
                    <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--color-brand-charcoal)', opacity: 0.45, fontFamily: 'var(--font-body)', fontWeight: 600, margin: '0 0 8px' }}>
                      {stat.label}
                    </p>
                    <p style={{ fontSize: '1.35rem', fontFamily: 'var(--font-display)', color: 'var(--color-brand-charcoal)', margin: '0 0 2px', fontWeight: 400 }}>
                      {stat.value}
                    </p>
                    <p style={{ fontSize: '11px', fontFamily: 'var(--font-body)', color: 'var(--color-brand-charcoal)', opacity: 0.45, margin: 0 }}>
                      {stat.sub}
                    </p>
                  </motion.div>
                ))}
              </div>

              {/* Quick Links */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  background: 'var(--glass-bg)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '12px',
                  padding: '28px',
                  boxShadow: 'var(--glass-shadow)',
                }}
              >
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: 'var(--color-brand-charcoal)', margin: '0 0 20px', fontWeight: 400 }}>
                  Quick Actions
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  {[
                    { label: 'Browse Collection', href: '/collection', desc: 'Explore new arrivals' },
                    { label: 'View Cart', href: '/cart', desc: 'Review your selections' },
                    { label: 'My Orders', href: '#', desc: 'Track your orders', onClick: () => setActiveTab('orders') },
                    ...(isAdminUser ? [{ label: 'Admin Dashboard', href: '/admin', desc: 'Manage storefront operations' }] : [])
                  ].map((item) => (
                    item.onClick ? (
                      <button
                        key={item.label}
                        onClick={item.onClick}
                        style={{
                          display: 'block', padding: '16px 18px',
                          background: 'rgba(15, 42, 91, 0.03)',
                          border: '1px solid var(--color-brand-mist)',
                          borderRadius: '8px', textAlign: 'left',
                          cursor: 'pointer', transition: 'all 0.25s',
                          width: '100%',
                        }}
                        className="profile-quick-link"
                      >
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--color-brand-charcoal)', margin: '0 0 4px' }}>
                          {item.label}
                        </p>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--color-brand-charcoal)', opacity: 0.45, margin: 0 }}>
                          {item.desc}
                        </p>
                      </button>
                    ) : (
                      <Link key={item.label} href={item.href || '#'} style={{ textDecoration: 'none' }}>
                        <div style={{
                          padding: '16px 18px',
                          background: 'rgba(15, 42, 91, 0.03)',
                          border: '1px solid var(--color-brand-mist)',
                          borderRadius: '8px', transition: 'all 0.25s',
                        }}
                        className="profile-quick-link"
                        >
                          <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--color-brand-charcoal)', margin: '0 0 4px' }}>
                            {item.label}
                          </p>
                          <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--color-brand-charcoal)', opacity: 0.45, margin: 0 }}>
                            {item.desc}
                          </p>
                        </div>
                      </Link>
                    )
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}

          {activeTab === 'orders' && (
            <motion.div
              key="orders"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 400, color: 'var(--color-brand-charcoal)', margin: 0 }}>
                  Order History
                </h2>
                {!ordersLoading && (
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-brand-charcoal)', opacity: 0.4, fontWeight: 600 }}>
                    {orders.length} {orders.length === 1 ? 'Order' : 'Orders'}
                  </span>
                )}
              </div>

              {ordersLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {[1, 2, 3].map(i => (
                    <div key={i} style={{
                      height: '100px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                      borderRadius: '12px', animation: 'pulse 1.5s ease infinite',
                    }} />
                  ))}
                </div>
              ) : orders.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 }}
                  style={{
                    textAlign: 'center', padding: '60px 24px',
                    background: 'var(--glass-bg)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '12px',
                    boxShadow: 'var(--glass-shadow)',
                  }}
                >
                  <div style={{ color: 'var(--color-brand-charcoal)', opacity: 0.2, marginBottom: '16px', display: 'flex', justifyContent: 'center' }}>
                    <PackageIcon />
                  </div>
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontStyle: 'italic', color: 'var(--color-brand-charcoal)', opacity: 0.5, margin: '0 0 8px' }}>
                    No orders yet
                  </p>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-brand-charcoal)', opacity: 0.35, margin: '0 0 24px', lineHeight: 1.5 }}>
                    Your curated pieces will appear here once you place an order
                  </p>
                  <Link href="/collection" style={{ textDecoration: 'none' }}>
                    <span style={{
                      display: 'inline-flex', padding: '12px 24px',
                      background: 'var(--color-brand-charcoal)', color: '#fff',
                      fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600,
                      textTransform: 'uppercase', letterSpacing: '0.15em',
                      borderRadius: '6px', cursor: 'pointer',
                    }}>
                      Explore Collection
                    </span>
                  </Link>
                </motion.div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {orders.map((order, i) => {
                    const statusStyle = getStatusColor(order.paymentStatus);
                    return (
                      <motion.div
                        key={order.id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                        style={{
                          background: 'var(--glass-bg)',
                          backdropFilter: 'blur(20px)',
                          WebkitBackdropFilter: 'blur(20px)',
                          border: '1px solid var(--glass-border)',
                          borderRadius: '12px',
                          padding: '20px 24px',
                          boxShadow: 'var(--glass-shadow)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                          <div style={{ flex: 1, minWidth: '200px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-brand-charcoal)', opacity: 0.5 }}>
                                #{order.id.slice(-8).toUpperCase()}
                              </span>
                              <span style={{
                                padding: '3px 10px', borderRadius: '100px',
                                fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.15em',
                                fontFamily: 'var(--font-body)',
                                background: statusStyle.bg, color: statusStyle.color,
                                border: `1px solid ${statusStyle.border}`,
                              }}>
                                {order.paymentStatus}
                              </span>
                            </div>
                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-brand-charcoal)', opacity: 0.5, margin: '0 0 8px' }}>
                              {formatDate(order.createdAt)} · {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {order.items.slice(0, 2).map((item, j) => (
                                <p key={j} style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-brand-charcoal)', margin: 0 }}>
                                  {item.title} <span style={{ opacity: 0.4 }}>· {item.size} · Qty {item.quantity}</span>
                                </p>
                              ))}
                              {order.items.length > 2 && (
                                <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--color-brand-charcoal)', opacity: 0.4, margin: 0 }}>
                                  +{order.items.length - 2} more
                                </p>
                              )}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', color: 'var(--color-brand-charcoal)', margin: '0 0 4px', fontWeight: 400 }}>
                              {formatCurrency(order.totalAmountINR, order.currency)}
                            </p>
                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '10px', color: 'var(--color-brand-charcoal)', opacity: 0.35, margin: 0, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                              {order.currency}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 400, color: 'var(--color-brand-charcoal)', margin: '0 0 24px' }}>
                Account Settings
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Account Info */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  style={{
                    background: 'var(--glass-bg)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '12px',
                    padding: '28px',
                    boxShadow: 'var(--glass-shadow)',
                  }}
                >
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--color-brand-charcoal)', margin: '0 0 20px', fontWeight: 400 }}>
                    Account Information
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {[
                      { label: 'Full Name', value: user?.name || 'Not set' },
                      { label: 'Email Address', value: user?.email || '' },
                      { label: 'Account Type', value: (user as any)?.role || 'Customer' },
                    ].map((field) => (
                      <div key={field.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid var(--color-brand-mist)' }}>
                        <div>
                          <p style={{ fontFamily: 'var(--font-body)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 600, color: 'var(--color-brand-charcoal)', opacity: 0.4, margin: '0 0 4px' }}>
                            {field.label}
                          </p>
                          <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--color-brand-charcoal)', margin: 0 }}>
                            {field.value}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>

                {/* Danger Zone */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  style={{
                    background: 'rgba(220, 38, 38, 0.02)',
                    border: '1px solid rgba(220, 38, 38, 0.1)',
                    borderRadius: '12px',
                    padding: '28px',
                  }}
                >
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: '#dc2626', margin: '0 0 8px', fontWeight: 400 }}>
                    Sign Out
                  </h3>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-brand-charcoal)', opacity: 0.5, margin: '0 0 20px', lineHeight: 1.5 }}>
                    You will be returned to the store homepage.
                  </p>
                  <button
                    onClick={handleSignOut}
                    disabled={signingOut}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '8px',
                      padding: '12px 20px',
                      background: 'rgba(220, 38, 38, 0.08)',
                      border: '1px solid rgba(220, 38, 38, 0.2)',
                      borderRadius: '8px', cursor: 'pointer',
                      color: '#dc2626', fontFamily: 'var(--font-body)', fontSize: '10px',
                      fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.15em',
                      transition: 'all 0.2s', opacity: signingOut ? 0.5 : 1,
                    }}
                  >
                    <LogoutIcon />
                    {signingOut ? 'Signing out...' : 'Sign Out of Account'}
                  </button>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 0.4; }
        }
        .profile-signout-btn:hover {
          background: rgba(255,255,255,0.14) !important;
          color: rgba(255,255,255,0.9) !important;
        }
        .profile-admin-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(166, 128, 38, 0.35) !important;
          filter: brightness(1.05);
        }
        .profile-quick-link:hover {
          background: rgba(15, 42, 91, 0.06) !important;
          border-color: var(--color-brand-charcoal) !important;
          transform: translateY(-1px);
        }
        @media (max-width: 480px) {
          .hidden-sm { display: none; }
        }
      `}</style>
    </main>
  );
}
