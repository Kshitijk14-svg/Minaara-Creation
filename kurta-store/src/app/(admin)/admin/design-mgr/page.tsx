'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import type { DesignConfig } from '@/types/schema';

const THEME_OPTIONS = [
  { value: 'pastel-pink', label: 'Pastel Pink' },
  { value: 'ivory-gold', label: 'Ivory Gold' },
  { value: 'midnight-rose', label: 'Midnight Rose' },
  { value: 'sage-green', label: 'Sage Green' },
] as const;

const toastVariants = {
  hidden: { opacity: 0, y: -20, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: -16, transition: { ease: 'easeIn', duration: 0.2 } },
};

export default function DesignManagerPage() {
  const router = useRouter();
  const [adminToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('admin_token');
    }
    return null;
  });
  const [config, setConfig] = useState<DesignConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Editable form state
  const [promoBannerText, setPromoBannerText] = useState('');
  const [activeTheme, setActiveTheme] = useState<string>('pastel-pink');
  const [isLookbookActive, setIsLookbookActive] = useState(true);
  const [heroBannersJson, setHeroBannersJson] = useState('');
  const [heroBannersJsonError, setHeroBannersJsonError] = useState('');

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Auth gate
  useEffect(() => {
    if (!adminToken) {
      router.replace('/admin/login');
    }
  }, [adminToken, router]);

  // Load config
  useEffect(() => {
    if (!adminToken) return;

    async function loadConfig() {
      try {
        const res = await fetch('/api/config/design');
        if (res.ok) {
          const data = (await res.json()) as DesignConfig;
          setConfig(data);
          setPromoBannerText(data.promoBannerText ?? '');
          setActiveTheme(data.activeTheme);
          setIsLookbookActive(data.isLookbookActive);
          setHeroBannersJson(JSON.stringify(data.heroBanners, null, 2));
        }
      } catch {
        showToast('Failed to load design config', 'error');
      } finally {
        setIsLoading(false);
      }
    }

    void loadConfig();
  }, [adminToken, showToast]);

  const handleHeroBannersBlur = () => {
    try {
      JSON.parse(heroBannersJson);
      setHeroBannersJsonError('');
    } catch {
      setHeroBannersJsonError('Invalid JSON — please check your formatting.');
    }
  };

  const handleSave = useCallback(async () => {
    if (!adminToken || heroBannersJsonError) {
      showToast('Please fix JSON errors before saving', 'error');
      return;
    }

    let parsedBanners: DesignConfig['heroBanners'];
    try {
      parsedBanners = JSON.parse(heroBannersJson) as DesignConfig['heroBanners'];
    } catch {
      showToast('Invalid hero banners JSON', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/config/design', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          promoBannerText: promoBannerText || null,
          activeTheme,
          isLookbookActive,
          heroBanners: parsedBanners,
        }),
      });

      if (res.ok) {
        const updated = (await res.json()) as DesignConfig;
        setConfig(updated);
        showToast('Design config saved successfully!', 'success');
      } else {
        const err = (await res.json()) as { error?: string };
        showToast(err.error ?? 'Failed to save', 'error');
      }
    } catch {
      showToast('Failed to save changes', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [adminToken, promoBannerText, activeTheme, isLookbookActive, heroBannersJson, heroBannersJsonError, showToast]);

  if (!adminToken || isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--color-brand-charcoal)' }}
      >
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: 'var(--color-brand-mauve)' }}
        />
      </div>
    );
  }

  return (
    <>
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="fixed top-6 right-6 z-50 px-5 py-3 rounded-lg text-sm shadow-xl"
            style={{
              backgroundColor: toast.type === 'success' ? 'var(--color-brand-charcoal)' : '#C0392B',
              color: 'white',
              fontFamily: 'var(--font-body)',
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

      {/* Admin Nav */}
      <nav
        className="sticky top-0 z-40 flex items-center justify-between px-6 md:px-12 py-4"
        style={{
          backgroundColor: 'var(--color-brand-charcoal)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div className="flex items-center gap-4">
          <span
            className="text-xs uppercase tracking-widest"
            style={{ color: 'var(--color-brand-mauve)' }}
          >
            Admin
          </span>
          <span
            style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', color: 'white' }}
          >
            Design Manager
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={isSaving || !!heroBannersJsonError}
            className="px-6 py-2.5 text-sm uppercase tracking-widest rounded-md transition-all disabled:opacity-40"
            style={{ backgroundColor: 'var(--color-brand-mauve)', color: 'white' }}
            id="design-mgr-save-btn"
          >
            {isSaving ? 'Saving…' : 'Save Changes'}
          </button>
          <button
            onClick={() => {
              sessionStorage.removeItem('admin_token');
              router.push('/admin/login');
            }}
            className="text-xs uppercase tracking-widest opacity-50 hover:opacity-80 transition-opacity"
            style={{ color: 'white' }}
          >
            Logout
          </button>
        </div>
      </nav>

      <main
        className="min-h-screen px-6 md:px-12 py-10"
        style={{ backgroundColor: '#1a1a1a' }}
      >
        <div className="max-w-3xl mx-auto space-y-8">
          {/* Last Updated */}
          {config && (
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-mono)' }}>
              Last saved: {new Date(config.updatedAt).toLocaleString('en-IN')}
            </p>
          )}

          {/* ── Promo Banner ── */}
          <section
            className="rounded-xl p-6"
            style={{ backgroundColor: 'var(--color-brand-charcoal)' }}
          >
            <h2
              className="text-lg mb-1"
              style={{ fontFamily: 'var(--font-display)', color: 'white', fontWeight: 400 }}
            >
              Promotional Banner
            </h2>
            <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Displayed at the top of the storefront. Leave empty to hide.
            </p>
            <textarea
              id="promo-banner-text"
              value={promoBannerText}
              onChange={(e) => setPromoBannerText(e.target.value)}
              placeholder="e.g. Free shipping on orders above ₹1999 · Use code WELCOME10"
              rows={3}
              className="w-full px-4 py-3 rounded-md text-sm resize-none focus:outline-none"
              style={{
                backgroundColor: '#2a2a2a',
                color: 'white',
                borderColor: 'rgba(196, 154, 138, 0.3)',
                border: '1px solid',
                fontFamily: 'var(--font-body)',
              }}
            />
          </section>

          {/* ── Active Theme ── */}
          <section
            className="rounded-xl p-6"
            style={{ backgroundColor: 'var(--color-brand-charcoal)' }}
          >
            <h2
              className="text-lg mb-1"
              style={{ fontFamily: 'var(--font-display)', color: 'white', fontWeight: 400 }}
            >
              Active Theme
            </h2>
            <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Controls the color theme across the storefront.
            </p>
            <select
              id="active-theme-select"
              value={activeTheme}
              onChange={(e) => setActiveTheme(e.target.value)}
              className="w-full px-4 py-3 rounded-md text-sm focus:outline-none"
              style={{
                backgroundColor: '#2a2a2a',
                color: 'white',
                border: '1px solid rgba(196, 154, 138, 0.3)',
                fontFamily: 'var(--font-body)',
              }}
            >
              {THEME_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </section>

          {/* ── Lookbook Toggle ── */}
          <section
            className="rounded-xl p-6"
            style={{ backgroundColor: 'var(--color-brand-charcoal)' }}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2
                  className="text-lg mb-1"
                  style={{ fontFamily: 'var(--font-display)', color: 'white', fontWeight: 400 }}
                >
                  Lookbook
                </h2>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {isLookbookActive
                    ? 'Lookbook is live and visible to visitors'
                    : 'Lookbook is hidden — shows a "Coming Soon" page'}
                </p>
              </div>
              <label className="toggle-switch" aria-label="Toggle lookbook visibility">
                <input
                  id="lookbook-active-toggle"
                  type="checkbox"
                  checked={isLookbookActive}
                  onChange={(e) => setIsLookbookActive(e.target.checked)}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </section>

          {/* ── Hero Banners JSON ── */}
          <section
            className="rounded-xl p-6"
            style={{ backgroundColor: 'var(--color-brand-charcoal)' }}
          >
            <h2
              className="text-lg mb-1"
              style={{ fontFamily: 'var(--font-display)', color: 'white', fontWeight: 400 }}
            >
              Hero Banners
            </h2>
            <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>
              JSON array of banner objects. Each must have: url, altText, linkHref.
            </p>
            <textarea
              id="hero-banners-json"
              value={heroBannersJson}
              onChange={(e) => setHeroBannersJson(e.target.value)}
              onBlur={handleHeroBannersBlur}
              rows={12}
              className="w-full px-4 py-3 rounded-md text-xs resize-y focus:outline-none"
              style={{
                backgroundColor: '#111',
                color: '#e0d0c8',
                border: `1px solid ${heroBannersJsonError ? '#C0392B' : 'rgba(196, 154, 138, 0.3)'}`,
                fontFamily: 'var(--font-mono)',
                lineHeight: 1.6,
              }}
              spellCheck={false}
            />
            {heroBannersJsonError && (
              <p className="mt-2 text-xs" style={{ color: '#C0392B' }}>{heroBannersJsonError}</p>
            )}
          </section>

          {/* Save Button (bottom) */}
          <button
            onClick={handleSave}
            disabled={isSaving || !!heroBannersJsonError}
            className="w-full py-4 text-sm uppercase tracking-widest rounded-md transition-all disabled:opacity-40"
            style={{ backgroundColor: 'var(--color-brand-mauve)', color: 'white' }}
          >
            {isSaving ? 'Saving Changes…' : 'Save All Changes'}
          </button>
        </div>
      </main>
    </>
  );
}
