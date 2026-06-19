'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import OverviewTab from './components/OverviewTab';
import ProductsTab from './components/ProductsTab';
import CollectionsTab from './components/CollectionsTab';
import CouponsTab from './components/CouponsTab';
import OrdersTab from './components/OrdersTab';

type AdminTab = 'overview' | 'products' | 'collections' | 'coupons' | 'orders';

interface AdminClientProps {
  session: any;
}

const GridIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
    <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
  </svg>
);
const BoxIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);
const FolderIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
  </svg>
);
const TagIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
    <line x1="7" y1="7" x2="7.01" y2="7"/>
  </svg>
);
const ShoppingBagIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
    <line x1="3" y1="6" x2="21" y2="6"/>
    <path d="M16 10a4 4 0 01-8 0"/>
  </svg>
);

function getInitials(name?: string | null, email?: string | null) {
  if (name) return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
  return email ? email[0].toUpperCase() : 'A';
}

const tabs: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview',    label: 'Overview',    icon: <GridIcon /> },
  { id: 'products',    label: 'Products',    icon: <BoxIcon /> },
  { id: 'collections', label: 'Collections', icon: <FolderIcon /> },
  { id: 'coupons',     label: 'Coupons',     icon: <TagIcon /> },
  { id: 'orders',      label: 'Orders',      icon: <ShoppingBagIcon /> },
];

export default function AdminClient({ session }: AdminClientProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  const user = session?.user;
  const role = (user as any)?.role as string;

  return (
    <main style={{ minHeight: '100vh', backgroundColor: 'var(--color-brand-ivory)', paddingBottom: '80px' }}>

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
          width: '300px', height: '300px', borderRadius: '50%',
          background: 'rgba(166,128,38,0.08)', pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: '-40px', left: '-40px',
          width: '200px', height: '200px', borderRadius: '50%',
          background: 'rgba(255,255,255,0.04)', pointerEvents: 'none',
        }} />

        <div style={{ maxWidth: '1200px', margin: '0 auto', position: 'relative' }}>
          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
            <Link href="/" style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              color: 'rgba(255,255,255,0.5)', textDecoration: 'none',
              fontSize: '10px', fontFamily: 'var(--font-body)', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.2em',
              transition: 'color 0.2s',
            }}>
              <span style={{ display: 'inline-block', width: '16px', height: '1px', backgroundColor: 'currentColor', opacity: 0.5 }} />
              Store
            </Link>
            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '10px' }}>·</span>
            <Link href="/profile" style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              color: 'rgba(255,255,255,0.5)', textDecoration: 'none',
              fontSize: '10px', fontFamily: 'var(--font-body)', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.2em',
              transition: 'color 0.2s',
            }}>
              Profile
            </Link>
          </div>

          {/* Title Row */}
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
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                style={{
                  fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.2em',
                  color: 'rgba(255,255,255,0.45)', margin: '0 0 6px',
                }}
              >
                {role?.replace(/_/g, ' ')}
              </motion.p>
              <motion.h1
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                style={{
                  fontFamily: 'var(--font-display)', fontSize: 'clamp(1.5rem, 4vw, 2.25rem)',
                  fontWeight: 400, color: '#fff', margin: '0 0 4px', letterSpacing: '0.02em',
                }}
              >
                Admin Dashboard
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                style={{
                  fontFamily: 'var(--font-body)', fontSize: '13px',
                  color: 'rgba(255,255,255,0.5)', margin: 0,
                }}
              >
                Welcome back, {user?.name || user?.email}
              </motion.p>
            </div>
          </div>

          {/* Tab Navigation */}
          <div style={{
            display: 'flex', gap: '0',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            marginTop: '8px', overflowX: 'auto',
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
                  marginBottom: '-1px', whiteSpace: 'nowrap', flexShrink: 0,
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
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px' }}>
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div key="overview" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
              <OverviewTab onTabChange={setActiveTab} />
            </motion.div>
          )}
          {activeTab === 'products' && (
            <motion.div key="products" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
              <ProductsTab role={role} />
            </motion.div>
          )}
          {activeTab === 'collections' && (
            <motion.div key="collections" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
              <CollectionsTab role={role} />
            </motion.div>
          )}
          {activeTab === 'coupons' && (
            <motion.div key="coupons" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
              <CouponsTab />
            </motion.div>
          )}
          {activeTab === 'orders' && (
            <motion.div key="orders" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
              <OrdersTab />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <style>{`
        @media (max-width: 480px) { .hidden-sm { display: none; } }
        .admin-row-hover:hover { background: rgba(15,42,91,0.025) !important; }
        .admin-action-btn { transition: all 0.15s; }
        .admin-action-btn:hover { opacity: 1 !important; }
      `}</style>
    </main>
  );
}
