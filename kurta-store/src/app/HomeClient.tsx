'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { useCart } from '@/components/providers/CartProvider';
import { useCurrency } from '@/components/providers/CurrencyProvider';
import { trackAddToCart, trackViewItemList } from '@/lib/analytics';
import { NarrativeLoader } from '@/components/ui/NarrativeLoader';
import { lenisInstance } from '@/components/providers/SmoothScrollProvider';
import { LookbookHotspot } from '@/components/ui/LookbookHotspot';
import { WishlistHeart } from '@/components/ui/WishlistHeart';
import type { Product, DesignConfig, LookbookHotspotData, SizeLabel, Collection, Testimonial } from '@/types/schema';
import {
  DEFAULT_HERO_CONTENT, DEFAULT_USP_ITEMS, DEFAULT_MARQUEE_WORDS,
  DEFAULT_ABOUT_PANELS, DEFAULT_EDITORIAL_STORIES, DEFAULT_STATS, DEFAULT_FOOTER_CONTENT,
} from '@/lib/design-defaults';

const CURRENCY_SYMBOLS: Record<string, string> = { INR: '₹', USD: '$', EUR: '€' };

// Module scope (not component state) so the intro splash plays once per SPA
// session, not on every back-navigation remount of HomeClient.
let hasShownIntroLoader = false;

export default function HomeClient({
  initialProducts,
  initialDesignConfig,
  newArrivals: newArrivalsProp,
  bestsellers: bestsellersProp,
  featured: featuredProp,
  collections: collectionsProp,
  testimonials: testimonialsProp,
}: {
  initialProducts: Product[];
  initialDesignConfig: DesignConfig | null;
  newArrivals?: Product[];
  bestsellers?: Product[];
  featured?: Product[];
  collections?: Collection[];
  testimonials?: Testimonial[];
}) {
  const heroRef = useRef<HTMLDivElement>(null);
  const lookbookImgRef = useRef<HTMLDivElement>(null);
  const hFeatRef = useRef<HTMLDivElement>(null);
  const hFeatWrapRef = useRef<HTMLDivElement>(null);
  const hFeatTrackRef = useRef<HTMLDivElement>(null);
  const hAboutRef = useRef<HTMLDivElement>(null);
  const hAboutWrapRef = useRef<HTMLDivElement>(null);
  const hAboutTrackRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLElement>(null);
  const gsapCtxRef = useRef<{ revert: () => void } | null>(null);
  const statsValueRefs = useRef<(HTMLDivElement | null)[]>([]);

  const products = initialProducts;
  const designConfig = initialDesignConfig;

  const NEW_ARRIVALS = newArrivalsProp ?? [];
  const BESTSELLERS = bestsellersProp ?? [];
  const H_FEATURES = featuredProp ?? [];
  const COLLECTIONS = collectionsProp ?? [];

  // Admin-editable homepage content (Design tab) — falls back to today's
  // copy when a field hasn't been saved yet (null pre-migration/pre-edit row).
  const HERO = designConfig?.heroContent ?? DEFAULT_HERO_CONTENT;
  const USP_ITEMS = designConfig?.uspItems?.length ? designConfig.uspItems : DEFAULT_USP_ITEMS;
  const MARQUEE_WORDS = designConfig?.marqueeWords?.length ? designConfig.marqueeWords : DEFAULT_MARQUEE_WORDS;
  const ABOUT_PANELS = designConfig?.aboutPanels?.length ? designConfig.aboutPanels : DEFAULT_ABOUT_PANELS;
  const EDITORIAL_STORIES = designConfig?.editorialStories?.length ? designConfig.editorialStories : DEFAULT_EDITORIAL_STORIES;
  const STATS = designConfig?.stats?.length ? designConfig.stats : DEFAULT_STATS;
  const FOOTER = designConfig?.footerContent ?? DEFAULT_FOOTER_CONTENT;
  const ACTIVE_TESTIMONIALS = testimonialsProp ?? [];

  const HOTSPOTS: LookbookHotspotData[] = [
    products[2] ? { id: 'h1', x: 28, y: 36, product: products[2] } : null,
    products[1] ? { id: 'h2', x: 54, y: 58, product: products[1] } : null,
    products[0] ? { id: 'h3', x: 72, y: 42, product: products[0] } : null,
  ].filter((h): h is LookbookHotspotData => h !== null);

  const [loaderVisible, setLoaderVisible] = useState(!hasShownIntroLoader);
  const [activeTestimonial, setActiveTestimonial] = useState(0);
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterStatus, setNewsletterStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const { addItem, items } = useCart();
  const { currency, convertPrice } = useCurrency();

  const fmt = useCallback((priceINR: number) => {
    const c = convertPrice(priceINR);
    return `${CURRENCY_SYMBOLS[currency] ?? ''}${c.toFixed(currency === 'INR' ? 0 : 2)}`;
  }, [convertPrice, currency]);

  // Hold the intro loader for at least 2.5 seconds — only on its first-ever
  // appearance in this SPA session, not on every back-navigation remount.
  useEffect(() => {
    if (hasShownIntroLoader) return;
    const t = setTimeout(() => { hasShownIntroLoader = true; setLoaderVisible(false); }, 2500);
    return () => clearTimeout(t);
  }, []);

  // Scroll to top on mount. Routed through Lenis (when active) rather than a
  // raw scrollTo — Lenis re-applies its own tracked scroll position every
  // ticker frame, so a native scrollTo alone can get overridden a frame later
  // by leftover inertia from the page just navigated away from.
  useEffect(() => {
    window.history.scrollRestoration = 'manual';
    const lenis = lenisInstance.current;
    if (lenis) {
      lenis.scrollTo(0, { immediate: true, force: true });
    } else {
      window.scrollTo(0, 0);
    }
  }, []);

  // Auto-cycle testimonials
  useEffect(() => {
    if (ACTIVE_TESTIMONIALS.length <= 1) return;
    const t = setInterval(() => setActiveTestimonial((v) => (v + 1) % ACTIVE_TESTIMONIALS.length), 4500);
    return () => clearInterval(t);
  }, []);

  // ── ALL GSAP Scroll Animations ─────────────────────────────────────────────
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let mm: any = null;
    let cancelled = false;

    (async () => {
      const { gsap } = await import('gsap');
      const { ScrollTrigger } = await import('gsap/ScrollTrigger');
      // Bail if this effect's cleanup already ran (e.g. the user navigated away
      // before these dynamic imports resolved) — otherwise this stale callback
      // still creates a matchMedia context/ScrollTriggers that nothing will ever
      // revert (gsapCtxRef has already moved on to the next mount by the time
      // this resolves), leaking pins that stack on top of the next mount's own.
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);

      mm = gsap.matchMedia();
      gsapCtxRef.current = mm;

      // 1. Desktop-only horizontal pinned animations (width >= 1024px)
      mm.add("(min-width: 1024px)", () => {
        // Featured Pieces horizontal scroll (pinned)
        if (hFeatRef.current && hFeatTrackRef.current && hFeatWrapRef.current) {
          const track = hFeatTrackRef.current;
          const naturalOverflow = track.scrollWidth - window.innerWidth + 96;
          if (naturalOverflow > 0) {
            const getTotal = () => track.scrollWidth - window.innerWidth + 96;
            gsap.to(track, {
              x: () => -getTotal(), ease: 'none',
              scrollTrigger: {
                trigger: hFeatRef.current, start: 'top top', end: () => `+=${getTotal()}`,
                scrub: true, pin: true, anticipatePin: 1, invalidateOnRefresh: true,
              },
            });
          } else {
            hFeatWrapRef.current.style.height = 'auto';
          }
        }

        // About Us horizontal scroll (pinned)
        if (hAboutRef.current && hAboutTrackRef.current && hAboutWrapRef.current) {
          const track = hAboutTrackRef.current;
          const naturalOverflow = track.scrollWidth - window.innerWidth + 96;
          if (naturalOverflow > 0) {
            const getTotal = () => track.scrollWidth - window.innerWidth + 96;
            gsap.to(track, {
              x: () => -getTotal(), ease: 'none',
              scrollTrigger: {
                trigger: hAboutRef.current, start: 'top top', end: () => `+=${getTotal()}`,
                scrub: true, pin: true, anticipatePin: 1, invalidateOnRefresh: true,
              },
            });
          } else {
            hAboutWrapRef.current.style.height = 'auto';
          }
        }
      });

      // 2. Animations running on all screens (min-width: 0px)
      mm.add("(min-width: 0px)", () => {
        // Hero parallax + fade-out
        if (heroRef.current) {
          gsap.to(heroRef.current.querySelector('.hero-content'), {
            opacity: 0, y: -80, scale: 0.97,
            scrollTrigger: { trigger: heroRef.current, start: 'top top', end: 'bottom top', scrub: 1 },
          });
          gsap.to(heroRef.current.querySelector('img'), {
            yPercent: 18, ease: 'none',
            scrollTrigger: { trigger: heroRef.current, start: 'top top', end: 'bottom top', scrub: true },
          });
        }

        // Lookbook image parallax
        if (lookbookImgRef.current) {
          gsap.to(lookbookImgRef.current.querySelector('img'), {
            yPercent: -14, ease: 'none',
            scrollTrigger: { trigger: lookbookImgRef.current, start: 'top bottom', end: 'bottom top', scrub: true },
          });
        }

        // Universal reveals
        document.querySelectorAll('.scroll-heading').forEach((el) => {
          gsap.fromTo(el,
            { clipPath: 'inset(0 100% 0 0)', opacity: 0 },
            {
              clipPath: 'inset(0 0% 0 0)', opacity: 1, duration: 1.1, ease: 'power3.out',
              scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none none' }
            },
          );
        });
        document.querySelectorAll('.slide-left').forEach((el) => {
          gsap.fromTo(el, { opacity: 0, x: -70 },
            {
              opacity: 1, x: 0, duration: 1, ease: 'power3.out',
              scrollTrigger: { trigger: el, start: 'top 82%', toggleActions: 'play none none none' }
            });
        });
        document.querySelectorAll('.fade-up').forEach((el) => {
          gsap.fromTo(el, { opacity: 0, y: 20 },
            {
              opacity: 1, y: 0, duration: 1, ease: 'power3.out',
              scrollTrigger: { trigger: el, start: 'top 90%', toggleActions: 'play none none none' }
            });
        });

        // Editorial cards clip-path unroll
        const editCards = document.querySelectorAll('.edit-card');
        if (editCards.length) {
          gsap.fromTo(editCards,
            { clipPath: 'inset(100% 0 0 0)', opacity: 0 },
            {
              clipPath: 'inset(0% 0 0 0)', opacity: 1, duration: 1.2, ease: 'power4.out', stagger: 0.15,
              scrollTrigger: { trigger: editCards[0], start: 'top 85%', toggleActions: 'play none none none' }
            },
          );
        }

        // Counter animation
        if (statsRef.current) {
          ScrollTrigger.create({
            trigger: statsRef.current, start: 'top 75%', once: true,
            onEnter: () => {
              STATS.forEach((stat, i) => {
                const obj = { val: 0 };
                gsap.to(obj, {
                  val: stat.value, duration: 2.2, ease: 'power2.out',
                  onUpdate() {
                    const el = statsValueRefs.current[i];
                    if (el) el.innerText = Math.round(obj.val) + stat.suffix;
                  },
                });
              });
            },
          });
        }

        // Section dividers
        document.querySelectorAll('.section-divider').forEach((el) => {
          gsap.fromTo(el, { scaleX: 0, transformOrigin: 'left center' },
            {
              scaleX: 1, duration: 1.5, ease: 'power3.out',
              scrollTrigger: { trigger: el, start: 'top 90%', toggleActions: 'play none none none' }
            });
        });

        // Product cards fade-up
        gsap.fromTo('.product-card', { opacity: 0, y: 40 },
          {
            opacity: 1, y: 0, duration: 0.65, stagger: 0.07, ease: 'power3.out',
            scrollTrigger: { trigger: '#collection', start: 'top 78%', toggleActions: 'play none none none' }
          });

        // Marquee words 3D tilt on scroll
        document.querySelectorAll('.marquee-word').forEach((el, i) => {
          gsap.fromTo(el,
            { opacity: 0, rotateY: 25, x: i % 2 === 0 ? -30 : 30 },
            {
              opacity: 1, rotateY: 0, x: 0, duration: 0.8, delay: i * 0.04,
              scrollTrigger: { trigger: el.parentElement, start: 'top 80%', toggleActions: 'play none none none' }
            },
          );
        });

        ScrollTrigger.refresh();
      });
    })();

    return () => {
      cancelled = true;
      mm?.revert();
      gsapCtxRef.current = null;
    };
  }, []);

  // GA4 view_item_list tracking via IntersectionObserver
  useEffect(() => {
    if (!products.length) return;
    const cards = document.querySelectorAll('.product-card[data-pid]');
    const seen = new Set<string>();
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting)
        .map((e) => products.find((p) => p.id === (e.target as HTMLElement).dataset.pid))
        .filter((p): p is Product => !!p && !seen.has(p.id));
      if (vis.length) { vis.forEach((p) => seen.add(p.id)); trackViewItemList(vis); }
    }, { threshold: 0.5 });
    cards.forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [products]);

  return (
    <main style={{ position: 'relative', overflow: 'hidden' }}>
      <NarrativeLoader isLoading={loaderVisible} />

      {/* ── Announcement Ticker ── */}
      <div style={{ backgroundColor: 'rgba(23, 57, 115, 0.88)', borderBottom: '1px solid rgba(196, 172, 112, 0.22)', overflow: 'hidden', position: 'relative', zIndex: 50 }}>
        <div style={{ padding: '8px 0', fontSize: '9px', letterSpacing: '0.22em', textTransform: 'uppercase', color: '#F4ECE1' }}>
          <div className="animate-ticker" style={{ display: 'inline-flex', whiteSpace: 'nowrap' }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} style={{ padding: '0 40px' }}>
                ✦ {designConfig?.promoBannerText ?? 'Free Shipping on Orders Above ₹2000'}
                &nbsp;&nbsp;✦ 10% Off First Order — Code: WELCOME10
                &nbsp;&nbsp;✦ Handcrafted with Natural Organic Dyes
              </span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ overflowX: 'hidden' }}>
        {/* ── HERO ── */}
        <section ref={heroRef} style={{ position: 'relative', height: '100vh', marginTop: '-64px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <Image src={HERO.imageUrl || '/hero-woman.webp'} alt={HERO.headline} fill className="object-cover object-center" priority sizes="100vw" style={{ opacity: 0.85 }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(12,8,6,0.72) 0%, rgba(23,57,115,0.25) 55%, rgba(23,57,115,0.08) 100%)' }} />

          <div className="hero-content" style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: '820px', margin: '0 auto', padding: '0 48px' }}>
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              style={{
                backgroundColor: 'rgba(244, 236, 225, 0.85)',
                border: '1px solid rgba(196, 172, 112, 0.28)',
                borderRadius: '20px',
                padding: '56px 64px',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 24px 60px rgba(23,57,115,0.22)',
                textAlign: 'center',
              }}>
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3, duration: 0.6 }}
                style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.32em', color: '#C4AC70', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                <span style={{ display: 'inline-block', width: '28px', height: '1px', backgroundColor: 'rgba(196,172,112,0.55)' }} />
                {HERO.badgeText}
                <span style={{ display: 'inline-block', width: '28px', height: '1px', backgroundColor: 'rgba(196,172,112,0.55)' }} />
              </motion.p>
              <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
                style={{ fontSize: 'clamp(3rem,6vw,6rem)', fontWeight: 300, lineHeight: 1.0, letterSpacing: '-0.02em', color: '#1A1A1A', marginBottom: '20px' }}>
                {HERO.headline}{' '}<em style={{ color: '#C4AC70', fontStyle: 'italic' }}>{HERO.headlineEmphasis}</em>
              </motion.h1>
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8, duration: 0.8 }}
                style={{ fontSize: '14px', lineHeight: 1.75, color: 'rgba(26,26,26,0.65)', maxWidth: '400px', margin: '0 auto 36px' }}>
                {HERO.subheading}
              </motion.p>
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.6 }} style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <Link href={HERO.ctaPrimaryHref} id="hero-explore-cta"
                  style={{ padding: '14px 40px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.18em', backgroundColor: '#32518C', color: '#C4AC70', borderRadius: '4px', textDecoration: 'none', fontWeight: 600, border: '1px solid rgba(196,172,112,0.35)' }}>{HERO.ctaPrimaryLabel}</Link>
                <Link href={HERO.ctaSecondaryHref}
                  style={{ padding: '14px 40px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.18em', backgroundColor: 'rgba(26,26,26,0.08)', border: '1px solid rgba(26,26,26,0.25)', color: '#1A1A1A', borderRadius: '4px', textDecoration: 'none' }}>{HERO.ctaSecondaryLabel}</Link>
              </motion.div>
            </motion.div>
          </div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4, duration: 1 }} style={{ position: 'absolute', bottom: '32px', left: '50%', transform: 'translateX(-50%)' }}>
            <div className="scroll-line-indicator" />
          </motion.div>
        </section>

        {/* ── USP Strip ── */}
        <div style={{ position: 'relative', zIndex: 10, margin: '-24px auto 0', maxWidth: '1104px', padding: '0 24px' }}>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '24px',
              padding: '18px 40px',
              borderRadius: '100px',
              backgroundColor: 'rgba(244, 236, 225, 0.95)',
              border: '1px solid rgba(196, 172, 112, 0.3)',
              boxShadow: '0 8px 24px rgba(23,57,115,0.08)',
            }}>
            {USP_ITEMS.map((item, i) => (
              <React.Fragment key={i}>
                {i > 0 && <div style={{ width: '1px', height: '32px', backgroundColor: 'rgba(196, 172, 112, 0.3)', flexShrink: 0 }} />}
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 600, color: '#32518C', marginBottom: '3px' }}>
                    <span style={{ color: '#C4AC70', marginRight: '6px' }}>{item.icon}</span>{item.title}
                  </div>
                  <div style={{ fontSize: '10px', color: 'rgba(26,26,26,0.52)' }}>{item.sub}</div>
                </div>
              </React.Fragment>
            ))}
          </motion.div>
        </div>

        {/* ── BRAND MARQUEE ── */}
        <section style={{ padding: '70px 0', backgroundColor: '#FAF8F5', overflow: 'hidden', borderBottom: '1px solid #E6E2D8' }}>
          <div style={{ marginBottom: '16px', overflow: 'hidden' }}>
            <div className="marquee-row-ltr" style={{ display: 'inline-flex', whiteSpace: 'nowrap', willChange: 'transform' }}>
              {Array.from({ length: 3 }).map((_, ri) =>
                MARQUEE_WORDS.map((word, wi) => (
                  <span key={`ltr-${ri}-${wi}`} className="marquee-word"
                    style={{ fontSize: 'clamp(2rem,5vw,4.5rem)', fontWeight: 300, letterSpacing: '-0.02em', color: wi % 3 === 0 ? '#1A1A1A' : wi % 3 === 1 ? 'transparent' : '#8C6F63', WebkitTextStroke: wi % 3 === 1 ? '1px #8C6F63' : '0', marginRight: '3rem', lineHeight: 1, fontStyle: wi % 4 === 2 ? 'italic' : 'normal', opacity: 0 }}>
                    {word}
                    {wi % 3 === 0 && <span style={{ fontSize: '1rem', color: '#C4AC70', marginLeft: '0.5rem' }}>✦</span>}
                  </span>
                ))
              )}
            </div>
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div className="marquee-row-rtl" style={{ display: 'inline-flex', whiteSpace: 'nowrap', willChange: 'transform' }}>
              {Array.from({ length: 3 }).map((_, ri) =>
                [...MARQUEE_WORDS].reverse().map((word, wi) => (
                  <span key={`rtl-${ri}-${wi}`} className="marquee-word"
                    style={{ fontSize: 'clamp(2rem,5vw,4.5rem)', fontWeight: 300, letterSpacing: '-0.02em', color: wi % 3 === 1 ? '#1A1A1A' : wi % 3 === 2 ? 'transparent' : '#8C6F63', WebkitTextStroke: wi % 3 === 2 ? '1px #1A1A1A' : '0', marginRight: '3rem', lineHeight: 1, fontStyle: wi % 4 === 1 ? 'italic' : 'normal', opacity: 0 }}>
                    {word}
                    {wi % 4 === 0 && <span style={{ fontSize: '1rem', color: '#C4AC70', marginLeft: '0.5rem' }}>◆</span>}
                  </span>
                ))
              )}
            </div>
          </div>
        </section>

        {/* ── COLLECTIONS SHOWCASE ── */}
        <section id="collection" style={{ padding: '80px 0' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 48px' }}>
            <div style={{ marginBottom: '40px' }}>
              <p className="fade-up" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', color: '#8C6F63', marginBottom: '8px', fontWeight: 500 }}>Curated for you</p>
              <h2 className="scroll-heading" style={{ fontSize: 'clamp(2rem,3vw,2.75rem)', fontWeight: 300, color: '#1A1A1A', margin: 0 }}>Shop by Collection</h2>
            </div>

            {COLLECTIONS.length === 0 ? (
              <div style={{ padding: '80px 0', textAlign: 'center', color: 'rgba(26,26,26,0.35)' }}>No collections available yet.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', columnGap: '24px', rowGap: '40px' }}>
                {COLLECTIONS.map((collection, i) => (
                  <motion.div key={collection.id} initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
                    <Link href={`/collection/${collection.slug}`} style={{ textDecoration: 'none', display: 'block' }}>
                      <div style={{ position: 'relative', aspectRatio: '3 / 4', borderRadius: '4px', overflow: 'hidden', backgroundColor: '#F4ECE1' }}>
                        {collection.imageUrl ? (
                          <Image src={collection.imageUrl} alt={collection.name} fill className="object-cover" sizes="(max-width: 768px) 50vw, 260px" style={{ transition: 'transform 0.8s var(--ease-out-expo)' }} />
                        ) : (
                          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(26,26,26,0.25)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Minaara</div>
                        )}
                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 55%)' }} />
                        <h3 style={{ position: 'absolute', bottom: '18px', left: '18px', right: '18px', fontSize: '1.1rem', fontWeight: 400, color: '#fff', margin: 0, fontFamily: 'var(--font-body)' }}>{collection.name}</h3>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── NEW ARRIVALS ── */}
        {NEW_ARRIVALS.length > 0 && (
          <section style={{ padding: '80px 0', backgroundColor: '#FAF8F5' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 48px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '40px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#A68026', display: 'inline-block' }} />
                    <p className="fade-up" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', color: '#8C6F63', fontWeight: 500, margin: 0 }}>Freshly Weaved</p>
                  </div>
                  <h2 className="scroll-heading" style={{ fontSize: 'clamp(2rem,3vw,2.75rem)', fontWeight: 300, color: '#1A1A1A', margin: 0 }}>New Arrivals</h2>
                </div>
                <p className="fade-up" style={{ fontSize: '13px', color: 'rgba(26,26,26,0.48)', maxWidth: '380px', lineHeight: 1.7, margin: 0 }}>A curated selection blending contemporary cuts with timeless hand-craftsmanship.</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', columnGap: '24px', rowGap: '84px' }}>
                {NEW_ARRIVALS.map((product, i) => (
                  <motion.div key={`na-${product.id}`} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-50px' }} transition={{ delay: i * 0.08, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>
                    <ProductCard product={product} fmt={fmt} onAdd={(size) => { const variantId = product.variants.find((v) => v.size === size)?.id; if (!variantId) return; addItem({ productId: product.id, variantId, title: product.title, size, quantity: 1, priceINR: product.priceINR, imageUrl: product.images[0] ?? '' }); trackAddToCart(product, size, 1); }} />
                  </motion.div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── HORIZONTAL PINNED — FEATURED PIECES ── */}
        {H_FEATURES.length > 0 && (
          <div ref={hFeatRef} style={{ position: 'relative', backgroundColor: '#0A0A0A', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', width: '600px', height: '600px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(50,130,255,0.45) 0%, rgba(50,130,255,0) 70%)', top: '-10%', left: '10%', pointerEvents: 'none', zIndex: 1 }} />
            <div style={{ position: 'absolute', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(196,172,112,0.4) 0%, rgba(196,172,112,0) 70%)', bottom: '10%', right: '15%', pointerEvents: 'none', zIndex: 1 }} />

            <div className="feat-title-wrap">
              <p className="feat-scroll-indicator-text fade-up" style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.25em', color: 'rgba(244,236,225,0.45)', marginBottom: '8px' }}>✦ Drag to explore</p>
              <h2 className="scroll-heading" style={{ fontSize: 'clamp(2rem,3vw,2.8rem)', fontWeight: 300, color: '#fff', margin: 0 }}>Featured Pieces</h2>
            </div>
            <div ref={hFeatWrapRef} className="feat-scroll-wrap" style={{ display: 'flex', alignItems: 'center', height: '100vh', padding: '0 48px', paddingTop: '140px', paddingBottom: '80px', position: 'relative', zIndex: 10 }}>
              <div ref={hFeatTrackRef} className="feat-scroll-track" style={{ display: 'flex', gap: '24px', willChange: 'transform' }}>
                {H_FEATURES.map((product, i) => (
                  <div key={`hx-${product.id}`} style={{ width: '300px', flexShrink: 0 }}>
                    <Link href={`/product/${product.slug}`} style={{ textDecoration: 'none', display: 'block' }}>
                      <div className="hx-card" style={{ position: 'relative', height: '420px', borderRadius: '12px', overflow: 'hidden', backgroundColor: '#1A1A1A', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        {product.images[0] && <Image src={product.images[0]} alt={product.title} fill className="object-cover hx-img" sizes="300px" style={{ transition: 'transform 0.8s var(--ease-out-expo)' }} />}
                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.4) 0%, transparent 60%)' }} />
                        <span style={{ position: 'absolute', top: '16px', left: '16px', fontSize: '11px', color: 'rgba(255,255,255,0.7)', padding: '4px 10px', borderRadius: '100px', backgroundColor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.08)' }}>{String(i + 1).padStart(2, '0')}</span>
                        <div style={{ position: 'absolute', bottom: '16px', left: '16px', right: '16px', padding: '16px', backgroundColor: 'rgba(20, 20, 20, 0.85)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                          <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: '6px' }}>{product.category}</span>
                          <h3 style={{ fontSize: '1.05rem', color: '#fff', margin: '0 0 6px', fontWeight: 400, fontFamily: 'var(--font-body)' }}>{product.title}</h3>
                          <p style={{ fontSize: '0.82rem', color: '#C4AC70', margin: 0, fontWeight: 500 }}>{fmt(product.priceINR)}</p>
                        </div>
                      </div>
                      <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(244,236,225,0.35)', margin: '14px 0 0', padding: '0 4px' }}>Shop Now →</p>
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── LOOKBOOK BANNER — Parallax ── */}
        <section style={{ position: 'relative', height: '72vh', overflow: 'hidden', backgroundColor: '#1A1A1A' }}>
          <div ref={lookbookImgRef} style={{ position: 'absolute', inset: '-12%', zIndex: 0 }}>
            <Image src="/lookbook-hotspot.webp" alt="Haveli Edit" fill className="object-cover object-center" sizes="100vw" style={{ opacity: 0.82 }} />
          </div>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(12,8,6,0.9) 0%, transparent 60%)', zIndex: 1 }} />
          <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
            {HOTSPOTS.map((h) => <LookbookHotspot key={h.id} data={h} />)}
          </div>
          <div style={{ position: 'absolute', bottom: '48px', zIndex: 20, width: '100%' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 48px' }}>
              <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.22em', color: '#F4ECE1', display: 'block', marginBottom: '10px' }}>✦ Interactive Lookbook</span>
              <h3 className="scroll-heading" style={{ fontSize: 'clamp(2rem,3.5vw,3rem)', color: '#fff', margin: '0 0 14px', fontWeight: 300 }}>The Haveli Edit</h3>
              <p className="fade-up" style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)', marginBottom: '28px', maxWidth: '400px', lineHeight: 1.65 }}>Hover over the gold pins to discover signature ensembles set against our heritage estates.</p>
              <Link href="/lookbook" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', backgroundColor: '#fff', color: '#1A1A1A', padding: '13px 28px', borderRadius: '4px', textDecoration: 'none', fontWeight: 500 }}>Explore Lookbook →</Link>
            </div>
          </div>
        </section>

        {/* ── EDITORIAL STORIES ── */}
        <section style={{ padding: '80px 0', backgroundColor: '#F5F2EC' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 48px' }}>
            <div style={{ textAlign: 'center', maxWidth: '480px', margin: '0 auto 48px' }}>
              <p className="fade-up" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', color: '#8C6F63', marginBottom: '12px' }}>Editorial Stories</p>
              <h2 className="scroll-heading" style={{ fontSize: 'clamp(1.8rem,2.5vw,2.5rem)', fontWeight: 300, color: '#1A1A1A', margin: '0 0 16px' }}>Stories in Weaves</h2>
              <div style={{ width: '40px', height: '1px', backgroundColor: '#8C6F63', margin: '0 auto' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '24px' }}>
              {EDITORIAL_STORIES.map((item, i) => (
                <div key={i} className="edit-card" style={{ position: 'relative', aspectRatio: '3/4', borderRadius: '12px', overflow: 'hidden', cursor: 'pointer' }}>
                  <Image src={item.imageUrl} alt={item.title} fill className="object-cover edit-img" sizes="33vw" />
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(12,8,6,0.88) 0%, rgba(12,8,6,0.18) 55%, transparent 75%)' }} />
                  <div style={{ position: 'absolute', bottom: '28px', left: '28px', right: '28px', color: '#fff' }}>
                    <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(244,236,225,0.65)', display: 'block', marginBottom: '6px' }}>{item.chapter}</span>
                    <h3 style={{ fontSize: '1.4rem', margin: '0 0 8px', fontWeight: 400 }}>{item.title}</h3>
                    <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.52)', margin: '0 0 14px', lineHeight: 1.5 }}>{item.desc}</p>
                    <Link href={item.href || '/lookbook'} style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#fff', textDecoration: 'none', borderBottom: '1px solid rgba(255,255,255,0.38)', paddingBottom: '2px' }}>Shop Look →</Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── BESTSELLERS ── */}
        {BESTSELLERS.length > 0 && (
          <section style={{ padding: '80px 0', background: 'linear-gradient(to bottom, #FAF8F5, #F5F2EC)' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 48px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '40px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <p className="fade-up" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', color: '#8C6F63', margin: '0 0 8px', fontWeight: 500 }}>Loved by many</p>
                  <h2 className="scroll-heading" style={{ fontSize: 'clamp(2rem,3vw,2.75rem)', fontWeight: 300, color: '#1A1A1A', margin: 0 }}>Bestselling Pieces</h2>
                </div>
                <Link href="#collection" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', color: '#8C6F63', textDecoration: 'none', borderBottom: '1px solid #8C6F63', paddingBottom: '2px' }}>View All →</Link>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', columnGap: '24px', rowGap: '84px' }}>
                {BESTSELLERS.map((product, i) => (
                  <motion.div key={`bs-${product.id}`} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-50px' }} transition={{ delay: i * 0.08, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>
                    <ProductCard product={product} fmt={fmt} onAdd={(size) => { const variantId = product.variants.find((v) => v.size === size)?.id; if (!variantId) return; addItem({ productId: product.id, variantId, title: product.title, size, quantity: 1, priceINR: product.priceINR, imageUrl: product.images[0] ?? '' }); trackAddToCart(product, size, 1); }} />
                  </motion.div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── STATS COUNTER ── */}
        <section ref={statsRef} style={{ padding: '80px 0', position: 'relative', backgroundColor: 'rgba(15, 20, 40, 0.92)', borderTop: '1px solid rgba(196,172,112,0.15)', borderBottom: '1px solid rgba(196,172,112,0.15)' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 48px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '32px', textAlign: 'center' }}>
              {STATS.map((stat, i) => (
                <div key={i} className="slide-left"
                  style={{ opacity: 0, border: '1px solid rgba(196, 172, 112, 0.18)', borderRadius: '16px', padding: '36px 24px' }}>
                  <div ref={(el) => { statsValueRefs.current[i] = el; }}
                    style={{ fontSize: 'clamp(2.5rem,4vw,4rem)', fontWeight: 300, color: '#C4AC70', lineHeight: 1, marginBottom: '10px' }}>
                    0{stat.suffix}
                  </div>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(244,236,225,0.5)' }}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── HORIZONTAL PINNED — ABOUT US ── */}
        <div ref={hAboutRef} style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, #F4ECE1 0%, #FAF8F5 50%, #EDE6DE 100%)' }}>
          <div style={{ position: 'absolute', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(196,172,112,0.4) 0%, rgba(196,172,112,0) 70%)', top: '-10%', left: '20%', pointerEvents: 'none', zIndex: 1 }} />
          <div style={{ position: 'absolute', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(50,81,140,0.28) 0%, rgba(50,81,140,0) 70%)', bottom: '5%', right: '10%', pointerEvents: 'none', zIndex: 1 }} />

          <div className="about-title-wrap">
            <p className="fade-up" style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.25em', color: 'rgba(26,26,26,0.35)', marginBottom: '6px' }}>✦ Our Pillars</p>
            <h2 className="scroll-heading" style={{ fontSize: 'clamp(2rem,3vw,2.8rem)', fontWeight: 300, color: '#1A1A1A', margin: 0 }}>About Minaara</h2>
          </div>
          <div className="about-scroll-indicator" style={{ position: 'absolute', bottom: '40px', left: '50%', transform: 'translateX(-50%)', zIndex: 20, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '40px', height: '1px', backgroundColor: 'rgba(26,26,26,0.25)' }} />
            <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(26,26,26,0.4)' }}>Scroll</span>
            <div style={{ width: '40px', height: '1px', backgroundColor: 'rgba(26,26,26,0.25)' }} />
          </div>
          <div ref={hAboutWrapRef} className="about-scroll-wrap" style={{ display: 'flex', alignItems: 'center', height: '100vh', paddingTop: '140px', paddingBottom: '80px', position: 'relative', zIndex: 10 }}>
            <div ref={hAboutTrackRef} className="about-scroll-track" style={{ display: 'flex', gap: '32px', padding: '0 48px', willChange: 'transform' }}>
              {ABOUT_PANELS.map((panel, i) => (
                <div key={i} style={{ width: 'calc(100vw - 120px)', maxWidth: '640px', flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div className="about-panel-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', alignItems: 'center', backgroundColor: 'rgba(250, 248, 245, 0.95)', border: '1px solid rgba(255, 255, 255, 0.65)', borderRadius: '20px', padding: '32px', boxShadow: '0 12px 40px rgba(15, 42, 91, 0.04)' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                        <span style={{ fontSize: '11px', color: '#C4AC70' }}>{panel.num}</span>
                        <div style={{ flex: 1, height: '1px', backgroundColor: '#E6E2D8' }} />
                        <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.2em', color: '#8C6F63' }}>{panel.label}</span>
                      </div>
                      <h3 style={{ fontSize: 'clamp(1.6rem,2.5vw,2.2rem)', fontWeight: 300, lineHeight: 1.2, color: '#1A1A1A', marginBottom: '20px' }}>{panel.heading}</h3>
                      <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'rgba(26,26,26,0.58)', marginBottom: '28px' }}>{panel.body}</p>
                      <div style={{ width: '40px', height: '2px', backgroundColor: '#8C6F63' }} />
                    </div>
                    <div className="about-panel-img-wrap" style={{ position: 'relative', height: '380px', borderRadius: '12px', overflow: 'hidden' }}>
                      <Image src={panel.imageUrl} alt={panel.heading} fill className="object-cover" sizes="300px" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 48px' }}>
          <div className="section-divider" />
        </div>

        {/* ── TESTIMONIALS ── */}
        {ACTIVE_TESTIMONIALS.length > 0 && (
          <section style={{ padding: '80px 0', position: 'relative' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 48px' }}>
              <div style={{ textAlign: 'center', marginBottom: '48px' }}>
                <p className="fade-up" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', color: '#8C6F63', marginBottom: '12px' }}>What They Say</p>
                <h2 className="scroll-heading" style={{ fontSize: 'clamp(1.8rem,2.5vw,2.5rem)', fontWeight: 300, color: '#1A1A1A', margin: 0 }}>Loved by Women Across India</h2>
              </div>
              <div style={{ position: 'relative', maxWidth: '800px', margin: '0 auto' }}>
                {(() => {
                  const t = ACTIVE_TESTIMONIALS[Math.min(activeTestimonial, ACTIVE_TESTIMONIALS.length - 1)];
                  return (
                    <AnimatePresence mode="wait">
                      <motion.div key={t.id}
                        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                        style={{ textAlign: 'center', padding: '48px 56px', backgroundColor: 'rgba(244, 236, 225, 0.95)', borderRadius: '16px', border: '1px solid rgba(196, 172, 112, 0.28)', boxShadow: '0 8px 32px rgba(23,57,115,0.07)' }}>
                        <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'center', gap: '4px' }}>
                          {Array.from({ length: t.rating }).map((_, i) => (
                            <span key={i} style={{ color: '#C4AC70', fontSize: '14px' }}>★</span>
                          ))}
                        </div>
                        <p style={{ fontSize: 'clamp(1rem,1.4vw,1.2rem)', lineHeight: 1.8, color: '#1A1A1A', fontStyle: 'italic', fontWeight: 300, marginBottom: '24px' }}>
                          "{t.text}"
                        </p>
                        <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.2em', color: '#8C6F63', margin: 0 }}>
                          {t.name}{t.city ? ` — ${t.city}` : ''}
                        </p>
                      </motion.div>
                    </AnimatePresence>
                  );
                })()}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '24px' }}>
                  {ACTIVE_TESTIMONIALS.map((_, i) => (
                    <button key={i} onClick={() => setActiveTestimonial(i)}
                      style={{ width: i === activeTestimonial ? '24px' : '8px', height: '8px', borderRadius: '100px', border: 'none', backgroundColor: i === activeTestimonial ? '#8C6F63' : '#E6E2D8', cursor: 'pointer', transition: 'all 0.3s ease' }}
                      aria-label={`Testimonial ${i + 1}`} />
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── NEWSLETTER ── */}
        <section style={{ padding: '80px 0', backgroundColor: '#FAF8F5' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 48px' }}>
            <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              style={{ textAlign: 'center', padding: '64px 48px', backgroundColor: '#F0EBE3', border: '1px solid rgba(196,172,112,0.22)', borderRadius: '24px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(196,172,112,0.06) 0%, transparent 60%)', pointerEvents: 'none' }} />
              <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.22em', color: '#C4AC70', marginBottom: '16px' }}>✦ Inner Circle</p>
              <h2 style={{ fontSize: 'clamp(1.8rem,2.5vw,2.5rem)', fontWeight: 300, color: '#32518C', margin: '0 0 16px' }}>Join the Inner Circle</h2>
              <p style={{ fontSize: '14px', lineHeight: 1.75, color: 'rgba(26,26,26,0.55)', maxWidth: '420px', margin: '0 auto 32px' }}>Early access to new collections, exclusive artisan insights and private viewing events — curated for you.</p>
              {newsletterStatus === 'success' ? (
                <p style={{ fontSize: '14px', color: '#32518C', fontWeight: 500 }}>✓ You're on the list. Welcome to the circle.</p>
              ) : (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newsletterEmail.trim()) return;
                    setNewsletterStatus('loading');
                    try {
                      const res = await fetch('/api/newsletter/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: newsletterEmail }) });
                      setNewsletterStatus(res.ok ? 'success' : 'error');
                    } catch { setNewsletterStatus('error'); }
                  }}
                  style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}
                >
                  <input
                    type="email"
                    required
                    value={newsletterEmail}
                    onChange={(e) => setNewsletterEmail(e.target.value)}
                    placeholder="YOUR EMAIL ADDRESS"
                    disabled={newsletterStatus === 'loading'}
                    style={{ padding: '14px 24px', fontSize: '11px', letterSpacing: '0.12em', backgroundColor: 'rgba(244,236,225,0.6)', border: '1px solid rgba(196,172,112,0.4)', borderRadius: '4px', outline: 'none', color: '#1A1A1A', width: '300px' }}
                  />
                  <button
                    type="submit"
                    disabled={newsletterStatus === 'loading'}
                    style={{ padding: '14px 32px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.18em', backgroundColor: '#32518C', color: '#C4AC70', border: '1px solid rgba(196,172,112,0.35)', borderRadius: '4px', cursor: newsletterStatus === 'loading' ? 'wait' : 'pointer', fontWeight: 600, opacity: newsletterStatus === 'loading' ? 0.7 : 1 }}
                  >
                    {newsletterStatus === 'loading' ? '…' : 'Subscribe'}
                  </button>
                  {newsletterStatus === 'error' && (
                    <p style={{ width: '100%', fontSize: '12px', color: '#C0392B', margin: 0 }}>Something went wrong. Please try again.</p>
                  )}
                </form>
              )}
            </motion.div>
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer style={{ backgroundColor: 'rgba(23, 57, 115, 0.95)', borderTop: '1px solid rgba(196, 172, 112, 0.2)', padding: '48px 0' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '24px' }}>
            <Link href="/" style={{ fontSize: '1.2rem', color: '#F4ECE1', opacity: 0.75, fontStyle: 'italic', textDecoration: 'none' }}>{FOOTER.tagline}</Link>
            <nav style={{ display: 'flex', gap: '32px' }}>
              {FOOTER.links.map((l) => (
                <Link key={l.href} href={l.href} style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(244,236,225,0.45)', textDecoration: 'none' }}>{l.label}</Link>
              ))}
            </nav>
            <p style={{ fontSize: '11px', color: 'rgba(244,236,225,0.3)', margin: 0 }}>© {new Date().getFullYear()} {FOOTER.tagline}</p>
          </div>
        </footer>

        <style>{`
          /* Marquee animations */
          .marquee-row-ltr { animation: marquee-ltr 38s linear infinite; }
          .marquee-row-rtl { animation: marquee-rtl 42s linear infinite; }
          @keyframes marquee-ltr { from { transform: translateX(0); } to { transform: translateX(-33.33%); } }
          @keyframes marquee-rtl { from { transform: translateX(-33.33%); } to { transform: translateX(0); } }

          .hx-card .hx-img { transition: transform 0.65s cubic-bezier(0.76,0,0.24,1); }
          .hx-card:hover .hx-img { transform: scale(1.06); }
          .edit-card .edit-img { transition: transform 0.65s cubic-bezier(0.76,0,0.24,1); }
          .edit-card:hover .edit-img { transform: scale(1.05); }

          @keyframes shimmer { 0%,100%{opacity:.4} 50%{opacity:.8} }

          #newsletter-email:focus {
            border-color: rgba(196,172,112,0.7) !important;
            background-color: rgba(244,236,225,0.8) !important;
            box-shadow: 0 0 0 3px rgba(196,172,112,0.12);
          }

          /* Hide scrollbar for carousels */
          .feat-scroll-wrap::-webkit-scrollbar,
          .about-scroll-wrap::-webkit-scrollbar {
            display: none;
          }
          .feat-scroll-wrap,
          .about-scroll-wrap {
            -ms-overflow-style: none;
            scrollbar-width: none;
          }

          .feat-title-wrap {
            position: absolute;
            top: 48px;
            left: 48px;
            z-index: 20;
          }
          .about-title-wrap {
            position: absolute;
            top: 48px;
            left: 48px;
            z-index: 20;
          }

          @media (max-width: 1023px) {
            .feat-title-wrap,
            .about-title-wrap {
              position: relative !important;
              top: auto !important;
              left: auto !important;
              padding: 40px 24px 20px !important;
            }
            .feat-scroll-indicator-text,
            .about-scroll-indicator {
              display: none !important;
            }
            .feat-scroll-wrap,
            .about-scroll-wrap {
              height: auto !important;
              padding: 0 0 40px !important;
              overflow-x: auto !important;
              -webkit-overflow-scrolling: touch;
            }
            .feat-scroll-track,
            .about-scroll-track {
              padding: 0 24px !important;
              transform: none !important;
            }
          }

          @media (max-width: 1100px) {
            [style*="repeat(4,1fr)"] { grid-template-columns: repeat(3,1fr) !important; }
          }
          @media (max-width: 768px) {
            [style*="repeat(4,1fr)"] { grid-template-columns: repeat(2,1fr) !important; }
            [style*="1fr 1fr"] { grid-template-columns: 1fr !important; }
            [style*="repeat(3,1fr)"] { grid-template-columns: 1fr !important; }
            [style*="padding: 0 48px"] { padding: 0 20px !important; }

            .about-panel-grid {
              grid-template-columns: 1fr !important;
              gap: 20px !important;
              padding: 20px !important;
            }
            .about-panel-img-wrap {
              height: 240px !important;
            }
          }
        `}</style>
      </div>
    </main>
  );
}

// ── Product Card ───────────────────────────────────────────────────────────────
interface PCProps { product: Product; fmt: (p: number) => string; onAdd: (size: SizeLabel) => void; }

function ProductCard({ product, fmt, onAdd }: PCProps) {
  const [hovered, setHovered] = useState(false);
  const [hoverSize, setHoverSize] = useState('');
  const firstAvail = Object.entries(product.sizes).find(([, s]) => s > 0)?.[0] ?? '';
  const availSizes = Object.entries(product.sizes).filter(([, s]) => s > 0);

  return (
    <article
      className="product-card"
      data-pid={product.id}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setHoverSize(''); }}
      style={{
        borderRadius: '12px',
        overflow: 'visible',
        backgroundColor: '#FAF8F5',
        border: '1px solid #E6E2D8',
        cursor: 'pointer',
        transition: 'box-shadow 0.35s ease, transform 0.35s ease',
        boxShadow: hovered ? '0 20px 60px rgba(44,44,44,0.12)' : '0 2px 8px rgba(26,26,26,0.04)',
        transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
        position: 'relative',
        zIndex: hovered ? 50 : 1,
      }}
    >
      <div style={{ borderRadius: '12px', overflow: 'hidden' }}>
        <Link href={`/product/${product.slug}`} style={{ textDecoration: 'none', display: 'block' }}>
          <div style={{ position: 'relative', aspectRatio: '3/4', overflow: 'hidden', backgroundColor: '#EDE9DF' }}>
            {product.images[0] && (
              <Image src={product.images[0]} alt={product.title} fill className="object-cover"
                style={{ transition: 'transform 0.65s cubic-bezier(0.76,0,0.24,1)', transform: hovered ? 'scale(1.06)' : 'scale(1)' }}
                sizes="(max-width: 768px) 50vw, 25vw" />
            )}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(12,8,6,0.2) 0%, transparent 50%)', opacity: hovered ? 1 : 0, transition: 'opacity 0.4s ease' }} />
            <span style={{ position: 'absolute', top: '12px', left: '12px', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 10px', borderRadius: '4px', backgroundColor: 'rgba(250,248,245,0.9)', color: '#1A1A1A', fontWeight: 600, border: '1px solid rgba(230,226,216,0.8)' }}>
              {product.category}
            </span>
            <WishlistHeart
              item={{ productId: product.id, slug: product.slug, title: product.title, imageUrl: product.images[0] ?? '', priceINR: product.priceINR, compareAtPriceINR: product.compareAtPriceINR }}
              size={16}
              style={{
                position: 'absolute', top: '12px', right: '12px', width: '30px', height: '30px',
                borderRadius: '50%', backgroundColor: 'rgba(250,248,245,0.9)', border: '1px solid rgba(230,226,216,0.8)',
              }}
            />
          </div>
          <div style={{ padding: '14px 16px 16px', backgroundColor: 'transparent' }}>
            <h3 style={{ fontSize: '0.92rem', fontWeight: 400, color: '#1A1A1A', margin: '0 0 4px', letterSpacing: '0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.title}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <p style={{ fontSize: '0.82rem', color: '#A68026', margin: 0, fontWeight: 500 }}>{fmt(product.priceINR)}</p>
              {product.compareAtPriceINR && product.compareAtPriceINR > product.priceINR && (
                <>
                  <p style={{ fontSize: '0.75rem', color: '#999', margin: 0, textDecoration: 'line-through' }}>{fmt(product.compareAtPriceINR)}</p>
                  <span style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '2px 6px', borderRadius: '3px', backgroundColor: 'rgba(192,57,43,0.1)', color: '#C0392B', border: '1px solid rgba(192,57,43,0.2)' }}>Sale</span>
                </>
              )}
            </div>
          </div>
        </Link>
      </div>

      {/* Quick-add tray */}
      {product.variants.length > 0 && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '100%',
          backgroundColor: '#FAF8F5',
          border: '1px solid #E6E2D8',
          borderTop: 'none',
          borderRadius: '0 0 12px 12px',
          overflow: 'hidden',
          maxHeight: hovered ? '64px' : '0',
          transition: 'max-height 0.38s cubic-bezier(0.22,1,0.36,1)',
          zIndex: 30,
          boxShadow: hovered ? '0 8px 24px rgba(26,26,26,0.08)' : 'none',
        }}>
          <div style={{ padding: '10px 16px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            {availSizes.map(([size]) => (
              <button key={size}
                onMouseEnter={() => setHoverSize(size)} onMouseLeave={() => setHoverSize('')}
                onClick={(e) => { e.preventDefault(); onAdd(size as SizeLabel); }}
                style={{ fontSize: '10px', padding: '4px 10px', border: '1px solid #8C6F63', borderRadius: '4px', backgroundColor: hoverSize === size ? '#8C6F63' : 'transparent', color: hoverSize === size ? '#fff' : '#1A1A1A', cursor: 'pointer', transition: 'all 0.15s ease' }}
                aria-label={`Add ${size}`}>{size}</button>
            ))}
            {firstAvail && (
              <button onClick={(e) => { e.preventDefault(); onAdd(firstAvail as SizeLabel); }}
                style={{ fontSize: '10px', padding: '4px 12px', borderRadius: '4px', marginLeft: 'auto', backgroundColor: '#1A1A1A', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 500 }}
                aria-label="Quick add">+ Cart</button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
