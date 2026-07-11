'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import LoadingSkeleton from './shared/LoadingSkeleton';

type AdminTab = 'overview' | 'products' | 'collections' | 'coupons' | 'orders';

interface Stats {
  totalProducts: number;
  activeCollections: number;
  totalCollections: number;
  activeCoupons: number;
  ordersToday: number;
  revenueToday: number;
}

interface OverviewTabProps {
  onTabChange: (tab: AdminTab) => void;
  initialStats?: Stats | null;
}

export default function OverviewTab({ onTabChange, initialStats }: OverviewTabProps) {
  const [stats, setStats] = useState<Stats | null>(initialStats ?? null);
  const [loading, setLoading] = useState(!initialStats);

  useEffect(() => {
    // Skip client fetch when the server already provided stats
    if (initialStats) return;

    async function fetchStats() {
      setLoading(true);
      try {
        const res = await fetch('/api/admin/stats');
        if (!res.ok) throw new Error('Failed to fetch stats');
        const data = await res.json();
        setStats(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, [initialStats]);

  const statCards = stats ? [
    { label: 'Total Products', value: stats.totalProducts.toString(), sub: 'across all collections', tab: 'products' as AdminTab },
    { label: 'Collections', value: `${stats.activeCollections} / ${stats.totalCollections}`, sub: 'active / total', tab: 'collections' as AdminTab },
    { label: 'Active Coupons', value: stats.activeCoupons.toString(), sub: 'currently valid', tab: 'coupons' as AdminTab },
    { label: 'Orders Today', value: stats.ordersToday.toString(), sub: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), tab: 'orders' as AdminTab },
    {
      label: 'Revenue Today',
      value: `₹${stats.revenueToday.toLocaleString('en-IN')}`,
      sub: 'gross, INR',
      tab: 'orders' as AdminTab,
    },
  ] : [];

  return (
    <div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 400, color: 'var(--color-brand-charcoal)', margin: '0 0 24px' }}>
        Overview
      </h2>

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : (
        <>
          {/* Stats Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
            {statCards.map((stat, i) => (
              <motion.button
                key={stat.label}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                onClick={() => onTabChange(stat.tab)}
                style={{
                  background: 'var(--admin-card-bg)',
                  border: '1px solid var(--admin-card-border)',
                  borderRadius: '12px',
                  padding: '24px',
                  boxShadow: 'var(--admin-card-shadow)',
                  textAlign: 'left', cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                className="overview-stat-card"
              >
                <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--color-brand-charcoal)', opacity: 0.45, fontFamily: 'var(--font-body)', fontWeight: 600, margin: '0 0 8px' }}>
                  {stat.label}
                </p>
                <p style={{ fontSize: '1.75rem', fontFamily: 'var(--font-display)', color: 'var(--color-brand-charcoal)', margin: '0 0 4px', fontWeight: 400 }}>
                  {stat.value}
                </p>
                <p style={{ fontSize: '11px', fontFamily: 'var(--font-body)', color: 'var(--color-brand-charcoal)', opacity: 0.4, margin: 0 }}>
                  {stat.sub}
                </p>
              </motion.button>
            ))}
          </div>

          {/* Quick Actions */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            style={{
              background: 'var(--admin-card-bg)',
              border: '1px solid var(--admin-card-border)',
              borderRadius: '12px',
              padding: '28px',
              boxShadow: 'var(--admin-card-shadow)',
            }}
          >
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: 'var(--color-brand-charcoal)', margin: '0 0 20px', fontWeight: 400 }}>
              Quick Actions
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
              {[
                { label: 'Manage Products', desc: 'Add, edit, or remove products', tab: 'products' as AdminTab },
                { label: 'Collections', desc: 'Organise product categories', tab: 'collections' as AdminTab },
                { label: 'Coupons', desc: 'Create discount codes', tab: 'coupons' as AdminTab },
                { label: 'Orders', desc: 'View and update order status', tab: 'orders' as AdminTab },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => onTabChange(item.tab)}
                  style={{
                    padding: '16px 18px',
                    background: 'rgba(15,42,91,0.03)',
                    border: '1px solid var(--color-brand-mist)',
                    borderRadius: '8px', textAlign: 'left',
                    cursor: 'pointer', transition: 'all 0.25s', width: '100%',
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
              ))}
            </div>
          </motion.div>
        </>
      )}

      <style>{`
        .overview-stat-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 40px rgba(15,42,91,0.1) !important;
          border-color: rgba(255,255,255,0.65) !important;
        }
        .profile-quick-link:hover {
          background: rgba(15,42,91,0.06) !important;
          border-color: var(--color-brand-charcoal) !important;
          transform: translateY(-1px);
        }
      `}</style>
    </div>
  );
}
