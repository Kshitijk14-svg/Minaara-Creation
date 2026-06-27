'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import OverviewTab from './components/OverviewTab';

// Lazy-loaded tabs — chunks download immediately (all tabs stay mounted via
// display:none) but don't block the first render of OverviewTab.
const ProductsTab    = dynamic(() => import('./components/ProductsTab'));
const CollectionsTab = dynamic(() => import('./components/CollectionsTab'));
const CouponsTab     = dynamic(() => import('./components/CouponsTab'));
const OrdersTab      = dynamic(() => import('./components/OrdersTab'));
const BlogTab        = dynamic(() => import('./components/BlogTab'));
const DesignTab      = dynamic(() => import('./components/DesignTab'));
const UsersTab       = dynamic(() => import('./components/UsersTab'));

type AdminTab = 'overview' | 'products' | 'collections' | 'coupons' | 'orders' | 'blog' | 'design' | 'users';

interface AdminClientProps {
  session: any;
  initialStats?: {
    totalProducts: number;
    activeCollections: number;
    totalCollections: number;
    activeCoupons: number;
    ordersToday: number;
    revenueToday: number;
  } | null;
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

const PenIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
  </svg>
);
const PaletteIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>
    <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 011.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
  </svg>
);
const UsersIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
  </svg>
);

const tabs: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview',    label: 'Overview',    icon: <GridIcon /> },
  { id: 'products',    label: 'Products',    icon: <BoxIcon /> },
  { id: 'collections', label: 'Collections', icon: <FolderIcon /> },
  { id: 'coupons',     label: 'Coupons',     icon: <TagIcon /> },
  { id: 'orders',      label: 'Orders',      icon: <ShoppingBagIcon /> },
  { id: 'blog',        label: 'Journal',     icon: <PenIcon /> },
  { id: 'design',      label: 'Design',      icon: <PaletteIcon /> },
  { id: 'users',       label: 'Users',       icon: <UsersIcon /> },
];

export default function AdminClient({ session, initialStats }: AdminClientProps) {
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

      {/* Tab Content — all tabs stay mounted to avoid re-fetching on switch */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px', position: 'relative' }}>
        <div style={{ display: activeTab === 'overview' ? 'block' : 'none' }}>
          <OverviewTab onTabChange={setActiveTab} initialStats={initialStats} />
        </div>
        <div style={{ display: activeTab === 'products' ? 'block' : 'none' }}>
          <ProductsTab role={role} />
        </div>
        <div style={{ display: activeTab === 'collections' ? 'block' : 'none' }}>
          <CollectionsTab role={role} />
        </div>
        <div style={{ display: activeTab === 'coupons' ? 'block' : 'none' }}>
          <CouponsTab />
        </div>
        <div style={{ display: activeTab === 'orders' ? 'block' : 'none' }}>
          <OrdersTab />
        </div>
        <div style={{ display: activeTab === 'blog' ? 'block' : 'none' }}>
          <BlogTab />
        </div>
        <div style={{ display: activeTab === 'design' ? 'block' : 'none' }}>
          <DesignTab />
        </div>
        <div style={{ display: activeTab === 'users' ? 'block' : 'none' }}>
          <UsersTab callerRole={role as any ?? 'STAFF'} />
        </div>
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
