'use client';

import React, { useCallback, useEffect, useState } from 'react';
import FormField, { inputStyle } from './shared/FormField';
import ImageUploader from './shared/ImageUploader';
import type { DesignConfig, HeroBanner } from '@/types/schema';

// ── Types ─────────────────────────────────────────────────────────────────────

const THEMES = [
  { value: 'pastel-pink',   label: 'Pastel Rose',    swatch: ['#F9DDD6', '#C89FA3'] },
  { value: 'ivory-gold',    label: 'Ivory Gold',     swatch: ['#FAF8F0', '#C4A84A'] },
  { value: 'midnight-rose', label: 'Midnight Rose',  swatch: ['#1A0A14', '#D4558A'] },
  { value: 'sage-green',    label: 'Sage Garden',    swatch: ['#EEF2E8', '#6B8C5A'] },
] as const;

type ThemeValue = (typeof THEMES)[number]['value'];

const EMPTY_BANNER: HeroBanner = { url: '', altText: '', linkHref: '' };

// ── Component ─────────────────────────────────────────────────────────────────

export default function DesignTab() {
  const [config, setConfig]         = useState<DesignConfig | null>(null);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [error, setError]           = useState('');

  const [banners, setBanners]             = useState<HeroBanner[]>([]);
  const [theme, setTheme]                 = useState<ThemeValue>('ivory-gold');
  const [promoBanner, setPromoBanner]     = useState('');
  const [lookbookActive, setLookbookActive] = useState(true);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/config/design');
      if (!res.ok) return; // DB/auth error — keep defaults (banners stays [])
      const data = await res.json() as DesignConfig;
      setConfig(data);
      // Guard: heroBanners may be a string or missing if the DB row is malformed
      const rawBanners = data.heroBanners;
      setBanners(Array.isArray(rawBanners) ? rawBanners : []);
      setTheme((data.activeTheme as ThemeValue) ?? 'ivory-gold');
      setPromoBanner(data.promoBannerText ?? '');
      setLookbookActive(data.isLookbookActive ?? true);
    } catch {
      // Network failure — silently keep defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = async () => {
    const validBanners = banners.filter((b) => b.url.trim());
    if (validBanners.some((b) => !b.altText.trim())) {
      setError('All banner images require alt text.'); return;
    }
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/config/design', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          heroBanners:      validBanners,
          activeTheme:      theme,
          promoBannerText:  promoBanner || null,
          isLookbookActive: lookbookActive,
        }),
      });
      if (!res.ok) { setError('Failed to save. Please try again.'); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const updateBanner = (i: number, key: keyof HeroBanner, val: string) =>
    setBanners((bs) => bs.map((b, idx) => idx === i ? { ...b, [key]: val } : b));

  const removeBanner = (i: number) => setBanners((bs) => bs.filter((_, idx) => idx !== i));

  const addBanner = () => setBanners((bs) => [...bs, { ...EMPTY_BANNER }]);

  if (loading) {
    return (
      <div style={{ padding: '40px 0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {[1, 2, 3].map((n) => (
          <div key={n} style={{ height: '56px', borderRadius: '8px', backgroundColor: 'var(--color-brand-mist)', opacity: 0.4, animation: 'pulse 1.5s ease-in-out infinite' }} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ padding: '32px 0', maxWidth: '800px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '36px' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 400, color: 'var(--color-brand-charcoal)', margin: 0 }}>
          Design Manager
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {saved && (
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: '#16a34a', fontWeight: 600 }}>
              ✓ Saved
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: '10px 28px', backgroundColor: 'var(--color-brand-charcoal)', color: '#fff', border: 'none', borderRadius: '4px', cursor: saving ? 'wait' : 'pointer', fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: '24px', padding: '12px 16px', borderRadius: '8px', backgroundColor: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)', fontFamily: 'var(--font-body)', fontSize: '13px', color: '#C0392B' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>

        {/* ── Hero Banners ─────────────────────────────────────────────── */}
        <section>
          <SectionHeader title="Hero Banners" subtitle="Shown in the homepage carousel. Ideal size: 1440×640px" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {banners.map((banner, i) => (
              <div key={i} style={{ padding: '20px', borderRadius: '10px', border: '1px solid var(--color-brand-mist)', backgroundColor: 'rgba(255,255,255,0.5)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-brand-charcoal)', opacity: 0.5 }}>
                    Banner {i + 1}
                  </span>
                  <button onClick={() => removeBanner(i)} style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: '#C0392B', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>
                    Remove
                  </button>
                </div>

                <FormField label="Image">
                  <ImageUploader
                    images={banner.url ? [banner.url] : []}
                    onChange={(urls) => updateBanner(i, 'url', urls[0] ?? '')}
                    maxImages={1}
                  />
                </FormField>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <FormField label="Alt Text" required>
                    <input
                      value={banner.altText}
                      onChange={(e) => updateBanner(i, 'altText', e.target.value)}
                      placeholder="Woman in silk kurta, festive collection"
                      style={inputStyle}
                    />
                  </FormField>
                  <FormField label="Link (optional)" hint="e.g. /collection or /lookbook">
                    <input
                      value={banner.linkHref}
                      onChange={(e) => updateBanner(i, 'linkHref', e.target.value)}
                      placeholder="/collection"
                      style={inputStyle}
                    />
                  </FormField>
                </div>
              </div>
            ))}

            {banners.length < 5 && (
              <button
                onClick={addBanner}
                style={{ padding: '14px', borderRadius: '10px', border: '1.5px dashed var(--color-brand-mist)', backgroundColor: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-brand-charcoal)', opacity: 0.5, transition: 'opacity 0.2s' }}
              >
                + Add Banner
              </button>
            )}
          </div>
        </section>

        {/* ── Theme ───────────────────────────────────────────────────── */}
        <section>
          <SectionHeader title="Colour Theme" subtitle="Controls the brand colour palette site-wide" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            {THEMES.map((t) => (
              <button
                key={t.value}
                onClick={() => setTheme(t.value)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  padding: '14px 18px', borderRadius: '10px',
                  border: `2px solid ${theme === t.value ? 'var(--color-brand-mauve)' : 'var(--color-brand-mist)'}`,
                  backgroundColor: theme === t.value ? 'rgba(140,111,99,0.06)' : 'rgba(255,255,255,0.5)',
                  cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                  {t.swatch.map((c, si) => (
                    <div key={si} style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: c, border: '1px solid rgba(0,0,0,0.06)' }} />
                  ))}
                </div>
                <div>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: theme === t.value ? 600 : 400, color: 'var(--color-brand-charcoal)', margin: 0 }}>
                    {t.label}
                  </p>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-brand-charcoal)', opacity: 0.4, margin: '2px 0 0' }}>
                    {t.value}
                  </p>
                </div>
                {theme === t.value && (
                  <span style={{ marginLeft: 'auto', color: 'var(--color-brand-mauve)', fontSize: '14px' }}>✓</span>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* ── Promo Banner ─────────────────────────────────────────────── */}
        <section>
          <SectionHeader title="Promo Banner" subtitle="The announcement bar at the top of every page. Leave blank to hide." />
          <FormField label="Banner Text">
            <input
              value={promoBanner}
              onChange={(e) => setPromoBanner(e.target.value)}
              placeholder="Free shipping on orders above ₹1,499 · Use code WELCOME10"
              style={inputStyle}
            />
          </FormField>
        </section>

        {/* ── Lookbook Toggle ──────────────────────────────────────────── */}
        <section>
          <SectionHeader title="Lookbook" subtitle="Show or hide the /lookbook page link in the navbar" />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }}>
            <div
              onClick={() => setLookbookActive((v) => !v)}
              style={{
                width: '44px', height: '24px', borderRadius: '12px',
                backgroundColor: lookbookActive ? 'var(--color-brand-mauve)' : 'var(--color-brand-mist)',
                position: 'relative', transition: 'background-color 0.2s', flexShrink: 0,
              }}
            >
              <div style={{
                position: 'absolute', top: '3px',
                left: lookbookActive ? '23px' : '3px',
                width: '18px', height: '18px', borderRadius: '50%',
                backgroundColor: '#fff',
                boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                transition: 'left 0.2s',
              }} />
            </div>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-brand-charcoal)' }}>
              {lookbookActive ? 'Lookbook is visible' : 'Lookbook is hidden'}
            </span>
          </label>
        </section>

        {config?.updatedAt && (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--color-brand-charcoal)', opacity: 0.35, marginTop: '4px' }}>
            Last saved {new Date(config.updatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <h3 style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-brand-charcoal)', margin: '0 0 4px' }}>
        {title}
      </h3>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-brand-charcoal)', opacity: 0.45, margin: 0 }}>
        {subtitle}
      </p>
    </div>
  );
}
