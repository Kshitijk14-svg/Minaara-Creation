'use client';

import React, { useCallback, useEffect, useState } from 'react';
import FormField, { inputStyle } from './shared/FormField';
import ImageUploader from './shared/ImageUploader';
import ArrayFieldEditor from './shared/ArrayFieldEditor';
import type { DesignConfig, HeroBanner, HeroContent, UspItem, AboutPanel, EditorialStory, StatItem, FooterContent } from '@/types/schema';
import {
  DEFAULT_HERO_CONTENT, DEFAULT_USP_ITEMS, DEFAULT_MARQUEE_WORDS,
  DEFAULT_ABOUT_PANELS, DEFAULT_EDITORIAL_STORIES, DEFAULT_STATS, DEFAULT_FOOTER_CONTENT,
} from '@/lib/design-defaults';

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

  const [heroContent, setHeroContent]         = useState<HeroContent>(DEFAULT_HERO_CONTENT);
  const [uspItems, setUspItems]               = useState<UspItem[]>(DEFAULT_USP_ITEMS);
  const [marqueeWords, setMarqueeWords]       = useState<string[]>(DEFAULT_MARQUEE_WORDS);
  const [marqueeInput, setMarqueeInput]       = useState('');
  const [aboutPanels, setAboutPanels]         = useState<AboutPanel[]>(DEFAULT_ABOUT_PANELS);
  const [editorialStories, setEditorialStories] = useState<EditorialStory[]>(DEFAULT_EDITORIAL_STORIES);
  const [stats, setStats]                     = useState<StatItem[]>(DEFAULT_STATS);
  const [footerContent, setFooterContent]     = useState<FooterContent>(DEFAULT_FOOTER_CONTENT);

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
      setHeroContent(data.heroContent ?? DEFAULT_HERO_CONTENT);
      setUspItems(Array.isArray(data.uspItems) && data.uspItems.length > 0 ? data.uspItems : DEFAULT_USP_ITEMS);
      setMarqueeWords(Array.isArray(data.marqueeWords) && data.marqueeWords.length > 0 ? data.marqueeWords : DEFAULT_MARQUEE_WORDS);
      setAboutPanels(Array.isArray(data.aboutPanels) && data.aboutPanels.length > 0 ? data.aboutPanels : DEFAULT_ABOUT_PANELS);
      setEditorialStories(Array.isArray(data.editorialStories) && data.editorialStories.length > 0 ? data.editorialStories : DEFAULT_EDITORIAL_STORIES);
      setStats(Array.isArray(data.stats) && data.stats.length > 0 ? data.stats : DEFAULT_STATS);
      setFooterContent(data.footerContent ?? DEFAULT_FOOTER_CONTENT);
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
          heroContent,
          uspItems,
          marqueeWords,
          aboutPanels,
          editorialStories,
          stats,
          footerContent,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string; issues?: Array<{ path: (string | number)[]; message: string }> } | null;
        const issue = data?.issues?.[0];
        const detail = issue ? `${issue.path.join('.')}: ${issue.message}` : data?.error;
        setError(detail ? `Failed to save — ${detail}` : 'Failed to save. Please try again.');
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError('Failed to save — network error. Please try again.');
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

        {/* ── Hero Content ────────────────────────────────────────────── */}
        <section>
          <SectionHeader title="Hero Content" subtitle="The headline, subcopy, background image and CTA buttons on the homepage hero" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <FormField label="Background Image">
              <ImageUploader
                images={heroContent.imageUrl ? [heroContent.imageUrl] : []}
                onChange={(urls) => setHeroContent((h) => ({ ...h, imageUrl: urls[0] ?? '' }))}
                maxImages={1}
              />
            </FormField>
            <FormField label="Badge Text" hint="e.g. New Collection — SS 2025">
              <input value={heroContent.badgeText} onChange={(e) => setHeroContent((h) => ({ ...h, badgeText: e.target.value }))} style={inputStyle} />
            </FormField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <FormField label="Headline">
                <input value={heroContent.headline} onChange={(e) => setHeroContent((h) => ({ ...h, headline: e.target.value }))} style={inputStyle} />
              </FormField>
              <FormField label="Headline Emphasis Word" hint="Rendered in italic gold, e.g. Grace">
                <input value={heroContent.headlineEmphasis} onChange={(e) => setHeroContent((h) => ({ ...h, headlineEmphasis: e.target.value }))} style={inputStyle} />
              </FormField>
            </div>
            <FormField label="Subheading">
              <textarea value={heroContent.subheading} onChange={(e) => setHeroContent((h) => ({ ...h, subheading: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </FormField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <FormField label="Primary CTA Label">
                <input value={heroContent.ctaPrimaryLabel} onChange={(e) => setHeroContent((h) => ({ ...h, ctaPrimaryLabel: e.target.value }))} style={inputStyle} />
              </FormField>
              <FormField label="Primary CTA Link">
                <input value={heroContent.ctaPrimaryHref} onChange={(e) => setHeroContent((h) => ({ ...h, ctaPrimaryHref: e.target.value }))} style={inputStyle} />
              </FormField>
              <FormField label="Secondary CTA Label">
                <input value={heroContent.ctaSecondaryLabel} onChange={(e) => setHeroContent((h) => ({ ...h, ctaSecondaryLabel: e.target.value }))} style={inputStyle} />
              </FormField>
              <FormField label="Secondary CTA Link">
                <input value={heroContent.ctaSecondaryHref} onChange={(e) => setHeroContent((h) => ({ ...h, ctaSecondaryHref: e.target.value }))} style={inputStyle} />
              </FormField>
            </div>
          </div>
        </section>

        {/* ── USP Strip ───────────────────────────────────────────────── */}
        <section>
          <SectionHeader title="USP Strip" subtitle="The 3 trust badges shown just below the hero (1–4 items)" />
          <ArrayFieldEditor<UspItem>
            items={uspItems}
            onChange={setUspItems}
            emptyItem={{ icon: '✦', title: '', sub: '' }}
            max={4}
            min={1}
            itemLabel={(item, i) => item.title || `Item ${i + 1}`}
            addLabel="+ Add USP Item"
            renderItem={(item, _i, update) => (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                <FormField label="Title">
                  <input value={item.title} onChange={(e) => update({ title: e.target.value })} style={inputStyle} />
                </FormField>
                <FormField label="Subtitle">
                  <input value={item.sub} onChange={(e) => update({ sub: e.target.value })} style={inputStyle} />
                </FormField>
              </div>
            )}
          />
        </section>

        {/* ── Marquee Words ───────────────────────────────────────────── */}
        <section>
          <SectionHeader title="Marquee Words" subtitle="The scrolling brand-word banner between the hero and collections" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
            {marqueeWords.map((word, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 10px 6px 14px', borderRadius: '100px', backgroundColor: 'rgba(140,111,99,0.08)', border: '1px solid var(--color-brand-mist)', fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-brand-charcoal)' }}>
                {word}
                <button
                  onClick={() => setMarqueeWords((ws) => ws.filter((_, idx) => idx !== i))}
                  disabled={marqueeWords.length <= 2}
                  style={{ background: 'none', border: 'none', cursor: marqueeWords.length <= 2 ? 'not-allowed' : 'pointer', color: '#C0392B', fontSize: '13px', lineHeight: 1, padding: 0, opacity: marqueeWords.length <= 2 ? 0.3 : 1 }}
                  aria-label={`Remove ${word}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              value={marqueeInput}
              onChange={(e) => setMarqueeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && marqueeInput.trim()) {
                  e.preventDefault();
                  setMarqueeWords((ws) => [...ws, marqueeInput.trim()]);
                  setMarqueeInput('');
                }
              }}
              placeholder="Add a word and press Enter"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              onClick={() => { if (marqueeInput.trim()) { setMarqueeWords((ws) => [...ws, marqueeInput.trim()]); setMarqueeInput(''); } }}
              style={{ padding: '10px 20px', borderRadius: '6px', border: '1px solid var(--color-brand-mist)', backgroundColor: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600, color: 'var(--color-brand-charcoal)' }}
            >
              Add
            </button>
          </div>
        </section>

        {/* ── About Minaara Panels ────────────────────────────────────── */}
        <section>
          <SectionHeader title="About Minaara Panels" subtitle="The pinned-scroll brand-story panels (num/label auto-shown as 01, 02…)" />
          <ArrayFieldEditor<AboutPanel>
            items={aboutPanels}
            onChange={(items) => setAboutPanels(items.map((it, idx) => ({ ...it, num: String(idx + 1).padStart(2, '0') })))}
            emptyItem={{ num: '', label: '', heading: '', body: '', imageUrl: '' }}
            min={2}
            itemLabel={(item, i) => `Panel ${String(i + 1).padStart(2, '0')} — ${item.label || 'Untitled'}`}
            addLabel="+ Add Panel"
            renderItem={(item, _i, update) => (
              <>
                <FormField label="Image">
                  <ImageUploader images={item.imageUrl ? [item.imageUrl] : []} onChange={(urls) => update({ imageUrl: urls[0] ?? '' })} maxImages={1} />
                </FormField>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                  <FormField label="Label" hint="e.g. Origin">
                    <input value={item.label} onChange={(e) => update({ label: e.target.value })} style={inputStyle} />
                  </FormField>
                  <FormField label="Heading">
                    <input value={item.heading} onChange={(e) => update({ heading: e.target.value })} style={inputStyle} />
                  </FormField>
                </div>
                <FormField label="Body">
                  <textarea value={item.body} onChange={(e) => update({ body: e.target.value })} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                </FormField>
              </>
            )}
          />
        </section>

        {/* ── Editorial Stories ───────────────────────────────────────── */}
        <section>
          <SectionHeader title="Editorial Stories" subtitle="The 'Stories in Weaves' chapter cards linking out to the lookbook" />
          <ArrayFieldEditor<EditorialStory>
            items={editorialStories}
            onChange={setEditorialStories}
            emptyItem={{ chapter: `Chapter ${String(editorialStories.length + 1).padStart(2, '0')}`, title: '', desc: '', imageUrl: '', href: '/lookbook' }}
            min={1}
            itemLabel={(item, i) => item.title || `Story ${i + 1}`}
            addLabel="+ Add Story"
            renderItem={(item, _i, update) => (
              <>
                <FormField label="Image">
                  <ImageUploader images={item.imageUrl ? [item.imageUrl] : []} onChange={(urls) => update({ imageUrl: urls[0] ?? '' })} maxImages={1} />
                </FormField>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <FormField label="Chapter Label">
                    <input value={item.chapter} onChange={(e) => update({ chapter: e.target.value })} style={inputStyle} />
                  </FormField>
                  <FormField label="Title">
                    <input value={item.title} onChange={(e) => update({ title: e.target.value })} style={inputStyle} />
                  </FormField>
                </div>
                <FormField label="Description">
                  <input value={item.desc} onChange={(e) => update({ desc: e.target.value })} style={inputStyle} />
                </FormField>
                <FormField label="Link" hint="e.g. /lookbook">
                  <input value={item.href} onChange={(e) => update({ href: e.target.value })} style={inputStyle} />
                </FormField>
              </>
            )}
          />
        </section>

        {/* ── Stats Counters ──────────────────────────────────────────── */}
        <section>
          <SectionHeader title="Stats Counters" subtitle="The numbers shown in the dark stats band (e.g. 2500+ Happy Customers)" />
          <ArrayFieldEditor<StatItem>
            items={stats}
            onChange={setStats}
            emptyItem={{ value: 0, suffix: '', label: '' }}
            min={1}
            itemLabel={(item, i) => item.label || `Stat ${i + 1}`}
            addLabel="+ Add Stat"
            renderItem={(item, _i, update) => (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '12px' }}>
                <FormField label="Value">
                  <input type="number" value={item.value} onChange={(e) => update({ value: Number(e.target.value) || 0 })} style={inputStyle} />
                </FormField>
                <FormField label="Suffix" hint="e.g. +, %, yrs">
                  <input value={item.suffix} onChange={(e) => update({ suffix: e.target.value })} style={inputStyle} />
                </FormField>
                <FormField label="Label">
                  <input value={item.label} onChange={(e) => update({ label: e.target.value })} style={inputStyle} />
                </FormField>
              </div>
            )}
          />
        </section>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <section>
          <SectionHeader title="Footer" subtitle="The brand tagline and nav links shown in the homepage footer" />
          <FormField label="Tagline">
            <input value={footerContent.tagline} onChange={(e) => setFooterContent((f) => ({ ...f, tagline: e.target.value }))} style={inputStyle} />
          </FormField>
          <div style={{ marginTop: '14px' }}>
            <ArrayFieldEditor<{ href: string; label: string }>
              items={footerContent.links}
              onChange={(links) => setFooterContent((f) => ({ ...f, links }))}
              emptyItem={{ href: '/', label: '' }}
              max={6}
              itemLabel={(item, i) => item.label || `Link ${i + 1}`}
              addLabel="+ Add Link"
              renderItem={(item, _i, update) => (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <FormField label="Label">
                    <input value={item.label} onChange={(e) => update({ label: e.target.value })} style={inputStyle} />
                  </FormField>
                  <FormField label="Link">
                    <input value={item.href} onChange={(e) => update({ href: e.target.value })} style={inputStyle} />
                  </FormField>
                </div>
              )}
            />
          </div>
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
