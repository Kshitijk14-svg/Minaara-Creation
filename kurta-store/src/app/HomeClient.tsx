'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { useCart } from '@/components/providers/CartProvider';
import { useCurrency } from '@/components/providers/CurrencyProvider';
import { trackAddToCart, trackViewItemList } from '@/lib/analytics';
import { MagneticLink } from '@/components/ui/MagneticLink';
import { NarrativeLoader } from '@/components/ui/NarrativeLoader';
import { LookbookHotspot } from '@/components/ui/LookbookHotspot';
import type { Product, DesignConfig, LookbookHotspotData } from '@/types/schema';

const CATEGORIES = ['All', 'Casual', 'Festive', 'Wedding', 'Work'] as const;
type Category = (typeof CATEGORIES)[number];

const MOCK_PRODUCTS: Product[] = [
  { id: 'prod-indigo', title: 'Indigo Linen Block-Print Kurta', description: 'Handwoven indigo linen, straight cut.', priceINR: 1299, images: ['/prod-bestseller.webp'], sizes: { XS: 3, S: 8, M: 12, L: 5, XL: 2, XXL: 0 }, category: 'Casual', isActive: true, createdAt: new Date().toISOString() },
  { id: 'prod-ivory', title: 'Classic Ivory Cotton Kurta', description: 'Soft-washed cotton, A-line silhouette.', priceINR: 1499, images: ['/prod-ivory.webp'], sizes: { XS: 2, S: 5, M: 8, L: 6, XL: 3, XXL: 1 }, category: 'Casual', isActive: true, createdAt: new Date().toISOString() },
  { id: 'prod-rose', title: 'Rose Chanderi Anarkali', description: 'Sheer rose pink chanderi, floor length.', priceINR: 3499, images: ['/prod-anarkali.webp'], sizes: { XS: 2, S: 5, M: 7, L: 3, XL: 1, XXL: 0 }, category: 'Festive', isActive: true, createdAt: new Date().toISOString() },
  { id: 'prod-navy', title: 'Navy Chikankari Straight Kurta', description: 'Navy cotton with chikankari embroidery.', priceINR: 1899, images: ['/prod-navy.webp'], sizes: { S: 3, M: 6, L: 4, XL: 2 }, category: 'Work', isActive: true, createdAt: new Date().toISOString() },
  { id: 'prod-blush', title: 'Blush Tissue Gharara Set', description: 'Bridal tissue silk with tilla embroidery.', priceINR: 4999, images: ['/prod-wedding.webp'], sizes: { XS: 1, S: 2, M: 3, L: 2, XL: 1, XXL: 0 }, category: 'Wedding', isActive: true, createdAt: new Date().toISOString() },
  { id: 'prod-terra', title: 'Terracotta Festive Kurta', description: 'Mulberry silk with gold border details.', priceINR: 2299, images: ['/prod-festive.webp'], sizes: { S: 4, M: 6, L: 4, XL: 2, XXL: 1 }, category: 'Festive', isActive: true, createdAt: new Date().toISOString() },
  { id: 'prod-pastel', title: 'Minaara Pastels Kurta Set', description: 'Pastel pink and mint with hand-done detailing.', priceINR: 2499, images: ['/new-arrivals.webp'], sizes: { XS: 1, S: 4, M: 6, L: 4, XL: 2 }, category: 'Casual', isActive: true, createdAt: new Date().toISOString() },
  { id: 'prod-ochre', title: 'Ochre Cotton Mul Kurta', description: 'Breathable mul cotton with delicate pintucks.', priceINR: 1699, images: ['/prod-festive.webp'], sizes: { S: 3, M: 5, L: 4, XL: 2 }, category: 'Casual', isActive: true, createdAt: new Date().toISOString() },
];

const NEW_ARRIVALS = MOCK_PRODUCTS.slice(0, 4);
const BESTSELLERS  = MOCK_PRODUCTS.slice(0, 4);
const H_FEATURES   = MOCK_PRODUCTS;

const HOTSPOTS: LookbookHotspotData[] = [
  { id: 'h1', x: 28, y: 36, product: MOCK_PRODUCTS[2] },
  { id: 'h2', x: 54, y: 58, product: MOCK_PRODUCTS[1] },
  { id: 'h3', x: 72, y: 42, product: MOCK_PRODUCTS[0] },
];

const STATS = [
  { value: 2500, suffix: '+', label: 'Happy Customers' },
  { value: 150,  suffix: '+', label: 'Unique Designs'  },
  { value: 100,  suffix: '%', label: 'Organic Fabrics' },
  { value: 7,    suffix: 'yrs', label: 'Craft Heritage' },
];

const TESTIMONIALS = [
  { name: 'Priya Sharma', city: 'Mumbai', text: 'The quality is unlike anything I\'ve found online. The Chanderi anarkali is absolutely stunning — I wore it to a wedding and received compliments all evening.', rating: 5 },
  { name: 'Anjali Mehta', city: 'Delhi', text: 'Minaara\'s fabrics feel luxurious and are so breathable. The block-print kurta has become my everyday favourite. Packaging was beautiful too!', rating: 5 },
  { name: 'Shreya Nair', city: 'Bangalore', text: 'Finally an Indian ethnic brand that understands modern silhouettes. The fit is perfect and the craft is genuine — you can feel the handwork in every piece.', rating: 5 },
  { name: 'Kavya Reddy', city: 'Hyderabad', text: 'The gharara set I ordered for my cousin\'s wedding was the highlight of the ceremony. Minaara has earned a lifelong customer.', rating: 5 },
];

const ABOUT_PANELS = [
  { num: '01', label: 'Origin', heading: 'Born in the lanes of Jaipur', body: 'Our journey began with a single kurta crafted by a master block-printer in a 400-year-old haveli. That garment sparked a movement — slow fashion rooted in Indian heritage.', img: '/lookbook-banner.webp' },
  { num: '02', label: 'Craft', heading: 'Every thread tells a story', body: 'We work exclusively with artisans who have inherited their craft across generations. Block printing, chikankari, zardosi — each technique takes years to master, and we honour that mastery.', img: '/lookbook-outdoor.webp' },
  { num: '03', label: 'Fabric', heading: 'Nature\'s finest woven in', body: 'We source only organic cotton, linen, and silk from certified farms. No synthetic dyes, no shortcuts — just pure, breathable fabric that feels as good as it looks.', img: '/lookbook-hotspot.webp' },
  { num: '04', label: 'Promise', heading: 'Fashion that gives back', body: 'For every piece sold, we invest 5% back into the communities of our artisans. Real wages, fair hours, and a sustainable livelihood for the hands behind each garment.', img: '/hero-woman.webp' },
];

const MARQUEE_WORDS = ['Handcrafted', 'Heritage', 'Organic', 'Artisanal', 'Timeless', 'Grace', 'Culture', 'Tradition', 'Weaves', 'Minaara'];

export default function HomeClient({ 
  initialProducts, 
  initialDesignConfig 
}: { 
  initialProducts: Product[]; 
  initialDesignConfig: DesignConfig | null; 
}) {
  const heroRef        = useRef<HTMLDivElement>(null);
  const lookbookImgRef = useRef<HTMLDivElement>(null);
  const hFeatRef       = useRef<HTMLDivElement>(null);
  const hFeatTrackRef  = useRef<HTMLDivElement>(null);
  const hAboutRef      = useRef<HTMLDivElement>(null);
  const hAboutTrackRef = useRef<HTMLDivElement>(null);
  const statsRef       = useRef<HTMLElement>(null);
  const gsapCtxRef     = useRef<{ revert: () => void } | null>(null);

  const [products, setProducts]             = useState<Product[]>(initialProducts.length ? initialProducts : MOCK_PRODUCTS);
  const [designConfig, setDesignConfig]     = useState<DesignConfig | null>(initialDesignConfig);
  const [activeCategory, setActiveCategory] = useState<Category>('All');
  const [isLoading, setIsLoading]           = useState(false);
  const [counters, setCounters]             = useState(STATS.map(() => 0));
  const [activeTestimonial, setActiveTestimonial] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);
  const [scrollDir, setScrollDir] = useState<'up' | 'down'>('up');
  const { addItem, items } = useCart();
  const { currency, convertPrice } = useCurrency();
  const cartCount = items.reduce((s, i) => s + i.quantity, 0);

  const fmt = useCallback((priceINR: number) => {
    const c = convertPrice(priceINR);
    const sym: Record<string, string> = { INR: '₹', USD: '$', EUR: '€' };
    return `${sym[currency] ?? ''}${c.toFixed(currency === 'INR' ? 0 : 2)}`;
  }, [convertPrice, currency]);

  // Load products
  useEffect(() => {
    // Force scroll to top on reload
    if (typeof window !== 'undefined') {
      window.history.scrollRestoration = 'manual';
      window.scrollTo(0, 0);
    }

    let lastScroll = window.scrollY;
    const handleScroll = () => {
      const currentScroll = window.scrollY;
      setIsScrolled(currentScroll > 40);
      
      if (currentScroll > lastScroll && currentScroll > 80) {
        setScrollDir('down');
      } else if (currentScroll < lastScroll) {
        setScrollDir('up');
      }
      lastScroll = currentScroll;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    // No fetch needed! Data comes from server component.
    setIsLoading(false);

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-cycle testimonials
  useEffect(() => {
    const t = setInterval(() => setActiveTestimonial((v) => (v + 1) % TESTIMONIALS.length), 4500);
    return () => clearInterval(t);
  }, []);

  // ── ALL GSAP Scroll Animations ─────────────────────────────────────────────
  useEffect(() => {
    if (isLoading) return;
    (async () => {
      const { gsap } = await import('gsap');
      const { ScrollTrigger } = await import('gsap/ScrollTrigger');
      gsap.registerPlugin(ScrollTrigger);
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      gsapCtxRef.current = gsap.context(() => {

        // 1. Hero parallax + fade-out
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

        // 4. Lookbook image parallax
        if (lookbookImgRef.current) {
          gsap.to(lookbookImgRef.current.querySelector('img'), {
            yPercent: -14, ease: 'none',
            scrollTrigger: { trigger: lookbookImgRef.current, start: 'top bottom', end: 'bottom top', scrub: true },
          });
        }

        // 5. Featured pieces horizontal scroll (pinned)
        if (hFeatRef.current && hFeatTrackRef.current) {
          const track = hFeatTrackRef.current;
          const total = track.scrollWidth - window.innerWidth + 96;
          gsap.to(track, {
            x: () => -total, ease: 'none',
            scrollTrigger: {
              trigger: hFeatRef.current, start: 'top top', end: () => `+=${total}`,
              scrub: 1, pin: true, anticipatePin: 1, invalidateOnRefresh: true,
            },
          });
        }

        // 6. About Us horizontal scroll (pinned)
        if (hAboutRef.current && hAboutTrackRef.current) {
          const track = hAboutTrackRef.current;
          const total = track.scrollWidth - window.innerWidth + 96;
          gsap.to(track, {
            x: () => -total, ease: 'none',
            scrollTrigger: {
              trigger: hAboutRef.current, start: 'top top', end: () => `+=${total}`,
              scrub: 1, pin: true, anticipatePin: 1, invalidateOnRefresh: true,
            },
          });
        }

        // 6.5 Universal fade-ups and heading reveals (must be declared AFTER pinned sections so ScrollTrigger calculates offsets correctly)
        document.querySelectorAll('.scroll-heading').forEach((el) => {
          gsap.fromTo(el,
            { clipPath: 'inset(0 100% 0 0)', opacity: 0 },
            { clipPath: 'inset(0 0% 0 0)', opacity: 1, duration: 1.1, ease: 'power3.out',
              scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none none' } },
          );
        });
        document.querySelectorAll('.slide-left').forEach((el) => {
          gsap.fromTo(el, { opacity: 0, x: -70 },
            { opacity: 1, x: 0, duration: 1, ease: 'power3.out',
              scrollTrigger: { trigger: el, start: 'top 82%', toggleActions: 'play none none none' } });
        });
        document.querySelectorAll('.slide-right').forEach((el) => {
          gsap.fromTo(el, { opacity: 0, x: 70 },
            { opacity: 1, x: 0, duration: 1, ease: 'power3.out',
              scrollTrigger: { trigger: el, start: 'top 82%', toggleActions: 'play none none none' } });
        });
        document.querySelectorAll('.fade-up').forEach((el) => {
          gsap.fromTo(el, { opacity: 0, y: 20 },
            { opacity: 1, y: 0, duration: 1, ease: 'power3.out',
              scrollTrigger: { trigger: el, start: 'top 90%', toggleActions: 'play none none none' } });
        });

        // 7. Editorial cards clip-path unroll
        const editCards = document.querySelectorAll('.edit-card');
        if (editCards.length) {
          gsap.fromTo(editCards,
            { clipPath: 'inset(100% 0 0 0)', opacity: 0 },
            { clipPath: 'inset(0% 0 0 0)', opacity: 1, duration: 1.2, ease: 'power4.out', stagger: 0.15,
              scrollTrigger: { trigger: editCards[0], start: 'top 85%', toggleActions: 'play none none none' } },
          );
        }

        // 8. Counter animation
        if (statsRef.current) {
          ScrollTrigger.create({
            trigger: statsRef.current, start: 'top 75%', once: true,
            onEnter: () => {
              STATS.forEach((stat, i) => {
                gsap.to({}, {
                  duration: 2.2, ease: 'power2.out',
                  onUpdate: function () {
                    const val = Math.round(stat.value * this.progress());
                    setCounters((prev) => { const n = [...prev]; n[i] = val; return n; });
                  },
                  onComplete: () => setCounters((prev) => { const n = [...prev]; n[i] = stat.value; return n; }),
                });
              });
            },
          });
        }

        // 9. Section dividers
        document.querySelectorAll('.section-divider').forEach((el) => {
          gsap.fromTo(el, { scaleX: 0, transformOrigin: 'left center' },
            { scaleX: 1, duration: 1.5, ease: 'power3.out',
              scrollTrigger: { trigger: el, start: 'top 90%', toggleActions: 'play none none none' } });
        });

        // 10. Product cards fade-up
        gsap.fromTo('.product-card', { opacity: 0, y: 40 },
          { opacity: 1, y: 0, duration: 0.65, stagger: 0.07, ease: 'power3.out',
            scrollTrigger: { trigger: '#collection', start: 'top 78%', toggleActions: 'play none none none' } });

        // 11. Marquee words 3D tilt on scroll
        document.querySelectorAll('.marquee-word').forEach((el, i) => {
          gsap.fromTo(el,
            { opacity: 0, rotateY: 25, x: i % 2 === 0 ? -30 : 30 },
            { opacity: 1, rotateY: 0, x: 0, duration: 0.8, delay: i * 0.04,
              scrollTrigger: { trigger: el.parentElement, start: 'top 80%', toggleActions: 'play none none none' } },
          );
        });

      });
    })();
    return () => { gsapCtxRef.current?.revert(); };
  }, [isLoading]);

  // GA4
  useEffect(() => {
    if (!products.length) return;
    const cards = document.querySelectorAll('.product-card[data-pid]');
    const seen  = new Set<string>();
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting)
        .map((e) => products.find((p) => p.id === (e.target as HTMLElement).dataset.pid))
        .filter((p): p is Product => !!p && !seen.has(p.id));
      if (vis.length) { vis.forEach((p) => seen.add(p.id)); trackViewItemList(vis); }
    }, { threshold: 0.5 });
    cards.forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [products]);

  const filtered = activeCategory === 'All' ? products : products.filter((p) => p.category === activeCategory);

  return (
    <main style={{ backgroundColor: '#FAF8F5' }}>
      <NarrativeLoader isLoading={isLoading} />

      {/* ── Announcement Ticker ── */}
      <div style={{ backgroundColor: '#1A1A1A', overflow: 'hidden', position: 'relative', zIndex: 50 }}>
        <div style={{ padding: '8px 0', fontSize: '9px', letterSpacing: '0.22em', textTransform: 'uppercase', fontFamily: 'var(--font-body)', color: '#F4ECE1' }}>
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

      {/* ── Navigation ── */}
      <nav style={{ 
        position: 'sticky', top: 0, zIndex: 40, 
        background: isScrolled ? 'rgba(250,248,245,0.96)' : 'linear-gradient(to bottom, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 100%)',
        backdropFilter: isScrolled ? 'blur(20px)' : 'none', 
        WebkitBackdropFilter: isScrolled ? 'blur(20px)' : 'none', 
        borderBottom: isScrolled ? '1px solid #E6E2D8' : '1px solid transparent',
        transform: scrollDir === 'down' ? 'translateY(-100%)' : 'translateY(0)',
        transition: 'all 0.4s cubic-bezier(0.22, 1, 0.36, 1)'
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px' }}>
          <div style={{ display: 'flex', gap: '36px', flex: 1 }}>
            {[{ href: '/#collection', label: 'Collection' }, { href: '/lookbook', label: 'Lookbook' }].map((l) => (
              <MagneticLink as="div" key={l.href}>
                <Link href={l.href} style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.14em', color: '#1A1A1A', opacity: 0.55, fontFamily: 'var(--font-body)', fontWeight: 500, textDecoration: 'none', transition: 'opacity 0.3s ease' }}>{l.label}</Link>
              </MagneticLink>
            ))}
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <MagneticLink as="div">
              <Link href="/" style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', color: '#1A1A1A', letterSpacing: '0.04em', fontWeight: 300, textDecoration: 'none' }}>Minaara Creation</Link>
            </MagneticLink>
          </div>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
            <MagneticLink as="div">
              <Link href="/cart" id="nav-cart-link" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.14em', color: '#1A1A1A', opacity: 0.55, fontFamily: 'var(--font-body)', fontWeight: 500, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px', transition: 'opacity 0.3s ease' }}>
                Cart
                {cartCount > 0 && (
                  <motion.span key={cartCount} initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: '#8C6F63', color: '#fff', fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {cartCount}
                  </motion.span>
                )}
              </Link>
            </MagneticLink>
          </div>
        </div>
      </nav>

      <div style={{ overflowX: 'hidden' }}>
        {/* ── HERO ── */}
        <section ref={heroRef} style={{ position: 'relative', height: '100vh', marginTop: '-64px', display: 'flex', alignItems: 'flex-end', overflow: 'hidden', backgroundColor: '#F4ECE1' }}>
        <Image src="/hero-woman.webp" alt="SS 2025 — Dressed in Grace" fill className="object-cover object-center" priority sizes="100vw" />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(12,8,6,0.8) 0%, rgba(20,14,10,0.15) 55%, transparent 80%)' }} />
        <div className="hero-content" style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: '1400px', margin: '0 auto', padding: '0 48px 80px' }}>
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.7 }}
            style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.28em', color: 'rgba(244,236,225,0.62)', marginBottom: '20px', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ display: 'inline-block', width: '32px', height: '1px', backgroundColor: 'rgba(244,236,225,0.38)' }} />
            New Collection — SS 2025
          </motion.p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(3.5rem,7vw,7rem)', fontWeight: 300, lineHeight: 1.0, letterSpacing: '-0.02em', color: '#fff', marginBottom: '24px', maxWidth: '740px' }}>
            {[{ word: 'Dressed', italic: false }, { word: ' in ', italic: false }, { word: 'Grace', italic: true }].map(({ word, italic }, wi) => (
              <span key={wi} style={{ display: 'inline', overflow: 'hidden' }}>
                {word.split('').map((ch, ci) => (
                  <motion.span key={`${wi}-${ci}`} initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + wi * 0.1 + ci * 0.022, ease: [0.22, 1, 0.36, 1], duration: 0.75 }}
                    style={{ display: 'inline-block', fontStyle: italic ? 'italic' : 'normal', color: italic ? '#E5C9BD' : '#fff' }}>{ch}</motion.span>
                ))}
              </span>
            ))}
          </h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.75, duration: 0.8 }}
            style={{ fontSize: '14px', lineHeight: 1.75, color: 'rgba(255,255,255,0.56)', maxWidth: '360px', marginBottom: '36px', fontFamily: 'var(--font-body)' }}>
            Ethnic wear for the woman who carries her heritage with quiet confidence.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65, duration: 0.6 }} style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <Link href="#collection" style={{ padding: '14px 36px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.16em', backgroundColor: '#fff', color: '#1A1A1A', borderRadius: '4px', textDecoration: 'none', fontFamily: 'var(--font-body)', fontWeight: 500 }} id="hero-explore-cta">Explore Collection</Link>
            <Link href="/lookbook" style={{ padding: '14px 36px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.16em', border: '1px solid rgba(255,255,255,0.38)', color: '#fff', borderRadius: '4px', textDecoration: 'none', fontFamily: 'var(--font-body)' }}>View Lookbook</Link>
          </motion.div>
        </div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4, duration: 1 }} style={{ position: 'absolute', bottom: '32px', left: '50%', transform: 'translateX(-50%)' }}>
          <div className="scroll-line-indicator" />
        </motion.div>
      </section>

      {/* ── USP Strip ── */}
      <div style={{ borderBottom: '1px solid #E6E2D8', backgroundColor: '#F5F2EC' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px' }}>
          {[
            { title: '100% Organic Fabrics', sub: 'Ethically sourced cotton & linen' },
            { title: 'Artisanal Handblock Prints', sub: 'Traditional printing heritage' },
            { title: 'Hassle-Free Exchange', sub: 'Easy returns within 7 days' },
          ].map((item, i) => (
            <React.Fragment key={i}>
              {i > 0 && <div style={{ width: '1px', height: '32px', backgroundColor: '#E6E2D8', flexShrink: 0 }} />}
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 600, color: '#1A1A1A', marginBottom: '4px', fontFamily: 'var(--font-body)' }}>{item.title}</div>
                <div style={{ fontSize: '10px', color: 'rgba(26,26,26,0.4)', fontFamily: 'var(--font-body)' }}>{item.sub}</div>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ── BRAND MARQUEE with silhouette words ── */}
      <section style={{ padding: '70px 0', backgroundColor: '#FAF8F5', overflow: 'hidden', borderBottom: '1px solid #E6E2D8' }}>
        {/* Row 1 — left to right (slow) */}
        <div style={{ marginBottom: '16px', overflow: 'hidden' }}>
          <div className="marquee-row-ltr" style={{ display: 'inline-flex', whiteSpace: 'nowrap', willChange: 'transform' }}>
            {Array.from({ length: 3 }).map((_, ri) =>
              MARQUEE_WORDS.map((word, wi) => (
                <span key={`ltr-${ri}-${wi}`} className="marquee-word"
                  style={{ fontSize: 'clamp(2rem,5vw,4.5rem)', fontFamily: 'var(--font-display)', fontWeight: 300, letterSpacing: '-0.02em', color: wi % 3 === 0 ? '#1A1A1A' : wi % 3 === 1 ? 'transparent' : '#8C6F63', WebkitTextStroke: wi % 3 === 1 ? '1px #8C6F63' : '0', marginRight: '3rem', lineHeight: 1, fontStyle: wi % 4 === 2 ? 'italic' : 'normal', opacity: 0 }}>
                  {word}
                  {wi % 3 === 0 && <span style={{ fontSize: '1rem', fontFamily: 'var(--font-body)', color: '#C4AC70', marginLeft: '0.5rem' }}>✦</span>}
                </span>
              ))
            )}
          </div>
        </div>
        {/* Row 2 — right to left (reversed) */}
        <div style={{ overflow: 'hidden' }}>
          <div className="marquee-row-rtl" style={{ display: 'inline-flex', whiteSpace: 'nowrap', willChange: 'transform' }}>
            {Array.from({ length: 3 }).map((_, ri) =>
              [...MARQUEE_WORDS].reverse().map((word, wi) => (
                <span key={`rtl-${ri}-${wi}`} className="marquee-word"
                  style={{ fontSize: 'clamp(2rem,5vw,4.5rem)', fontFamily: 'var(--font-display)', fontWeight: 300, letterSpacing: '-0.02em', color: wi % 3 === 1 ? '#1A1A1A' : wi % 3 === 2 ? 'transparent' : '#8C6F63', WebkitTextStroke: wi % 3 === 2 ? '1px #1A1A1A' : '0', marginRight: '3rem', lineHeight: 1, fontStyle: wi % 4 === 1 ? 'italic' : 'normal', opacity: 0 }}>
                  {word}
                  {wi % 4 === 0 && <span style={{ fontSize: '1rem', fontFamily: 'var(--font-body)', color: '#C4AC70', marginLeft: '0.5rem' }}>◆</span>}
                </span>
              ))
            )}
          </div>
        </div>
      </section>

      {/* ── COLLECTIONS GRID ── */}
      <section id="collection" style={{ padding: '80px 0' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 48px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '40px', gap: '24px', flexWrap: 'wrap' }}>
            <div>
              <p className="fade-up" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', color: '#8C6F63', marginBottom: '8px', fontFamily: 'var(--font-body)', fontWeight: 500 }}>Curated for you</p>
              <h2 className="scroll-heading" style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem,3vw,2.75rem)', fontWeight: 300, color: '#1A1A1A', margin: 0 }}>The Collection</h2>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {CATEGORIES.map((cat) => (
                <button key={cat} id={`filter-${cat.toLowerCase()}`} onClick={() => setActiveCategory(cat)}
                  style={{ padding: '6px 20px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', borderRadius: '100px', border: `1px solid ${activeCategory === cat ? '#8C6F63' : '#E6E2D8'}`, backgroundColor: activeCategory === cat ? '#8C6F63' : 'transparent', color: activeCategory === cat ? '#fff' : 'rgba(26,26,26,0.6)', cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.2s ease' }}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <AnimatePresence mode="wait">
            {isLoading ? (
              <div key="skel" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', columnGap: '24px', rowGap: '84px' }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} style={{ aspectRatio: '3/4', borderRadius: '12px', backgroundColor: '#EDE9DF', animation: `shimmer 1.5s ${i * 0.1}s ease-in-out infinite` }} />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div key="empty" style={{ padding: '80px 0', textAlign: 'center', color: 'rgba(26,26,26,0.35)', fontFamily: 'var(--font-body)' }}>No pieces in this category yet.</div>
            ) : (
              <motion.div key={activeCategory} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
                style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', columnGap: '24px', rowGap: '84px' }}>
                {filtered.map((product, i) => (
                  <motion.div key={product.id} initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
                    <ProductCard product={product} fmt={fmt}
                      onAdd={(size) => { addItem({ productId: product.id, title: product.title, size, quantity: 1, priceINR: product.priceINR, imageUrl: product.images[0] ?? '' }); trackAddToCart(product, size, 1); }} />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* ── HORIZONTAL PINNED — FEATURED PIECES ── */}
      <div ref={hFeatRef} style={{ position: 'relative', backgroundColor: '#1A1A1A', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '48px', left: '48px', zIndex: 20 }}>
          <p className="fade-up" style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.25em', color: 'rgba(244,236,225,0.45)', marginBottom: '8px', fontFamily: 'var(--font-body)' }}>✦ Drag to explore</p>
          <h2 className="scroll-heading" style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem,3vw,2.8rem)', fontWeight: 300, color: '#fff', margin: 0 }}>Featured Pieces</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', height: '100vh', padding: '0 48px', paddingTop: '140px' }}>
          <div ref={hFeatTrackRef} style={{ display: 'flex', gap: '24px', willChange: 'transform' }}>
            {H_FEATURES.map((product, i) => (
              <div key={`hx-${product.id}`} style={{ width: '300px', flexShrink: 0 }}>
                <Link href={`/product/${product.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                  <div className="hx-card" style={{ position: 'relative', height: '420px', borderRadius: '12px', overflow: 'hidden', backgroundColor: '#2A2A2A' }}>
                    <Image src={product.images[0]} alt={product.title} fill className="object-cover hx-img" sizes="300px" />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(12,8,6,0.9) 0%, transparent 55%)' }} />
                    <span style={{ position: 'absolute', top: '16px', left: '16px', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'rgba(196,172,112,0.7)' }}>{String(i + 1).padStart(2, '0')}</span>
                    <div style={{ position: 'absolute', bottom: '24px', left: '24px', right: '24px' }}>
                      <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.18em', color: '#E5DAC9', display: 'block', marginBottom: '6px', fontFamily: 'var(--font-body)' }}>{product.category}</span>
                      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: '#fff', margin: '0 0 6px', fontWeight: 400 }}>{product.title}</h3>
                      <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: '#C4AC70', margin: 0 }}>{fmt(product.priceINR)}</p>
                    </div>
                  </div>
                  <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(244,236,225,0.35)', fontFamily: 'var(--font-body)', margin: '14px 0 0', padding: '0 4px' }}>Shop Now →</p>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>

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
          <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 48px' }}>
            <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.22em', color: '#F4ECE1', display: 'block', marginBottom: '10px', fontFamily: 'var(--font-body)' }}>✦ Interactive Lookbook</span>
            <h3 className="scroll-heading" style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem,3.5vw,3rem)', color: '#fff', margin: '0 0 14px', fontWeight: 300 }}>The Haveli Edit</h3>
            <p className="fade-up" style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)', marginBottom: '28px', maxWidth: '400px', fontFamily: 'var(--font-body)', lineHeight: 1.65 }}>Hover over the gold pins to discover signature ensembles set against our heritage estates.</p>
            <Link href="/lookbook" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', backgroundColor: '#fff', color: '#1A1A1A', padding: '13px 28px', borderRadius: '4px', textDecoration: 'none', fontFamily: 'var(--font-body)', fontWeight: 500 }}>Explore Lookbook →</Link>
          </div>
        </div>
      </section>

      {/* ── NEW ARRIVALS ── */}
      <section style={{ padding: '80px 0', backgroundColor: '#FAF8F5' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 48px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '40px', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#A68026', display: 'inline-block' }} />
                <p className="fade-up" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', color: '#8C6F63', fontFamily: 'var(--font-body)', fontWeight: 500, margin: 0 }}>Freshly Weaved</p>
              </div>
              <h2 className="scroll-heading" style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem,3vw,2.75rem)', fontWeight: 300, color: '#1A1A1A', margin: 0 }}>New Arrivals</h2>
            </div>
            <p className="fade-up" style={{ fontSize: '13px', color: 'rgba(26,26,26,0.48)', fontFamily: 'var(--font-body)', maxWidth: '380px', lineHeight: 1.7, margin: 0 }}>A curated selection blending contemporary cuts with timeless hand-craftsmanship.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', columnGap: '24px', rowGap: '84px' }}>
            {NEW_ARRIVALS.map((product, i) => (
              <motion.div key={`na-${product.id}`} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-50px' }} transition={{ delay: i * 0.08, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>
                <ProductCard product={product} fmt={fmt} onAdd={(size) => { addItem({ productId: product.id, title: product.title, size, quantity: 1, priceINR: product.priceINR, imageUrl: product.images[0] ?? '' }); trackAddToCart(product, size, 1); }} />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HORIZONTAL PINNED — ABOUT US ── */}
      <div ref={hAboutRef} style={{ position: 'relative', overflow: 'hidden', backgroundColor: '#FAF8F5' }}>
        {/* Fixed label */}
        <div style={{ position: 'absolute', top: '48px', left: '48px', zIndex: 20 }}>
          <p className="fade-up" style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.25em', color: 'rgba(26,26,26,0.35)', marginBottom: '6px', fontFamily: 'var(--font-body)' }}>✦ Our Pillars</p>
          <h2 className="scroll-heading" style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem,3vw,2.8rem)', fontWeight: 300, color: '#1A1A1A', margin: 0 }}>About Minaara</h2>
        </div>
        {/* Scroll indicator */}
        <div style={{ position: 'absolute', bottom: '40px', left: '50%', transform: 'translateX(-50%)', zIndex: 20, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '40px', height: '1px', backgroundColor: 'rgba(26,26,26,0.25)' }} />
          <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(26,26,26,0.4)', fontFamily: 'var(--font-body)' }}>Scroll</span>
          <div style={{ width: '40px', height: '1px', backgroundColor: 'rgba(26,26,26,0.25)' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', height: '100vh', paddingTop: '140px', paddingBottom: '80px' }}>
          <div ref={hAboutTrackRef} style={{ display: 'flex', gap: '32px', padding: '0 48px', willChange: 'transform' }}>
            {ABOUT_PANELS.map((panel, i) => (
              <div key={i} className="about-panel-content" style={{ width: 'calc(100vw - 120px)', maxWidth: '600px', flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                {/* Panel layout: text left, image right */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px', alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#C4AC70' }}>{panel.num}</span>
                      <div style={{ flex: 1, height: '1px', backgroundColor: '#E6E2D8' }} />
                      <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.2em', color: '#8C6F63', fontFamily: 'var(--font-body)' }}>{panel.label}</span>
                    </div>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.6rem,2.5vw,2.2rem)', fontWeight: 300, lineHeight: 1.2, color: '#1A1A1A', marginBottom: '20px' }}>{panel.heading}</h3>
                    <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'rgba(26,26,26,0.58)', fontFamily: 'var(--font-body)', marginBottom: '28px' }}>{panel.body}</p>
                    <div style={{ width: '40px', height: '2px', backgroundColor: '#8C6F63' }} />
                  </div>
                  <div style={{ position: 'relative', height: '380px', borderRadius: '12px', overflow: 'hidden' }}>
                    <Image src={panel.img} alt={panel.heading} fill className="object-cover" sizes="300px" />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(244,236,225,0.15) 0%, transparent 60%)' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 48px' }}>
        <div className="section-divider" />
      </div>

      {/* ── EDITORIAL STORIES — clip-path unroll ── */}
      <section style={{ padding: '80px 0', backgroundColor: '#F5F2EC' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 48px' }}>
          <div style={{ textAlign: 'center', maxWidth: '480px', margin: '0 auto 48px' }}>
            <p className="fade-up" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', color: '#8C6F63', marginBottom: '12px', fontFamily: 'var(--font-body)' }}>Editorial Stories</p>
            <h2 className="scroll-heading" style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem,2.5vw,2.5rem)', fontWeight: 300, color: '#1A1A1A', margin: '0 0 16px' }}>Stories in Weaves</h2>
            <div style={{ width: '40px', height: '1px', backgroundColor: '#8C6F63', margin: '0 auto' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '24px' }}>
            {[
              { src: '/lookbook-banner.webp', chapter: 'Chapter 01', title: 'The Occasion Edit', desc: 'Festive dressing reimagined for the contemporary woman.' },
              { src: '/lookbook-outdoor.webp', chapter: 'Chapter 02', title: 'Garden Stories', desc: 'Florals and foliage meet handblock print heritage.' },
              { src: '/lookbook-outdoor.webp', chapter: 'Chapter 03', title: 'Heritage Craft', desc: 'Ancient weaving traditions for the modern wardrobe.' },
            ].map((item, i) => (
              <div key={i} className="edit-card" style={{ position: 'relative', aspectRatio: '3/4', borderRadius: '12px', overflow: 'hidden', cursor: 'pointer' }}>
                <Image src={item.src} alt={item.title} fill className="object-cover edit-img" sizes="33vw" />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(12,8,6,0.88) 0%, rgba(12,8,6,0.18) 55%, transparent 75%)' }} />
                <div style={{ position: 'absolute', bottom: '28px', left: '28px', right: '28px', color: '#fff' }}>
                  <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(244,236,225,0.65)', display: 'block', marginBottom: '6px', fontFamily: 'var(--font-body)' }}>{item.chapter}</span>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', margin: '0 0 8px', fontWeight: 400 }}>{item.title}</h3>
                  <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.52)', margin: '0 0 14px', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>{item.desc}</p>
                  <Link href="/lookbook" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#fff', textDecoration: 'none', borderBottom: '1px solid rgba(255,255,255,0.38)', paddingBottom: '2px', fontFamily: 'var(--font-body)' }}>Shop Look →</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS COUNTER ── */}
      <section ref={statsRef} style={{ padding: '80px 0', backgroundColor: '#1A1A1A' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 48px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '48px', textAlign: 'center' }}>
            {STATS.map((stat, i) => (
              <div key={i} className="slide-left" style={{ opacity: 0 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.5rem,4vw,4rem)', fontWeight: 300, color: '#fff', lineHeight: 1, marginBottom: '8px' }}>
                  {counters[i]}{stat.suffix}
                </div>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(244,236,225,0.4)', fontFamily: 'var(--font-body)' }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BESTSELLERS ── */}
      <section style={{ padding: '80px 0', background: 'linear-gradient(to bottom, #FAF8F5, #F5F2EC)' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 48px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '40px', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <p className="fade-up" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', color: '#8C6F63', margin: '0 0 8px', fontFamily: 'var(--font-body)', fontWeight: 500 }}>Loved by many</p>
              <h2 className="scroll-heading" style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem,3vw,2.75rem)', fontWeight: 300, color: '#1A1A1A', margin: 0 }}>Bestselling Pieces</h2>
            </div>
            <Link href="#collection" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', color: '#8C6F63', textDecoration: 'none', borderBottom: '1px solid #8C6F63', paddingBottom: '2px', fontFamily: 'var(--font-body)' }}>View All →</Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', columnGap: '24px', rowGap: '84px' }}>
            {BESTSELLERS.map((product, i) => (
              <motion.div key={`bs-${product.id}`} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-50px' }} transition={{ delay: i * 0.08, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>
                <ProductCard product={product} fmt={fmt} onAdd={(size) => { addItem({ productId: product.id, title: product.title, size, quantity: 1, priceINR: product.priceINR, imageUrl: product.images[0] ?? '' }); trackAddToCart(product, size, 1); }} />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section style={{ padding: '80px 0', backgroundColor: '#F5F2EC', borderTop: '1px solid #E6E2D8' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 48px' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <p className="fade-up" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', color: '#8C6F63', marginBottom: '12px', fontFamily: 'var(--font-body)' }}>What They Say</p>
            <h2 className="scroll-heading" style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem,2.5vw,2.5rem)', fontWeight: 300, color: '#1A1A1A', margin: 0 }}>Loved by Women Across India</h2>
          </div>
          <div style={{ position: 'relative', maxWidth: '800px', margin: '0 auto' }}>
            <AnimatePresence mode="wait">
              <motion.div key={activeTestimonial}
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                style={{ textAlign: 'center', padding: '48px', backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #E6E2D8', boxShadow: '0 8px 40px rgba(26,26,26,0.06)' }}>
                {/* Stars */}
                <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'center', gap: '4px' }}>
                  {Array.from({ length: TESTIMONIALS[activeTestimonial].rating }).map((_, i) => (
                    <span key={i} style={{ color: '#A68026', fontSize: '14px' }}>★</span>
                  ))}
                </div>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1rem,1.4vw,1.25rem)', lineHeight: 1.75, color: '#1A1A1A', fontStyle: 'italic', fontWeight: 300, marginBottom: '28px' }}>
                  &ldquo;{TESTIMONIALS[activeTestimonial].text}&rdquo;
                </p>
                <div>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600, color: '#1A1A1A', textTransform: 'uppercase', letterSpacing: '0.15em', margin: '0 0 4px' }}>{TESTIMONIALS[activeTestimonial].name}</p>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: '10px', color: 'rgba(26,26,26,0.4)', letterSpacing: '0.1em', margin: 0 }}>{TESTIMONIALS[activeTestimonial].city}</p>
                </div>
              </motion.div>
            </AnimatePresence>
            {/* Dots */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '24px' }}>
              {TESTIMONIALS.map((_, i) => (
                <button key={i} onClick={() => setActiveTestimonial(i)}
                  style={{ width: i === activeTestimonial ? '24px' : '8px', height: '8px', borderRadius: '100px', backgroundColor: i === activeTestimonial ? '#8C6F63' : '#E6E2D8', border: 'none', cursor: 'pointer', transition: 'all 0.3s ease', padding: 0 }} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── SEEN IN MINAARA ── */}
      <section style={{ padding: '80px 0', borderTop: '1px solid #E6E2D8', backgroundColor: '#FAF8F5' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 48px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '40px', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', color: '#8C6F63', margin: '0 0 8px', fontFamily: 'var(--font-body)', fontWeight: 500 }}>As styled by icons</p>
              <h2 className="scroll-heading" style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem,3vw,2.75rem)', fontWeight: 300, color: '#1A1A1A', margin: 0 }}>Seen in Minaara</h2>
            </div>
            <p style={{ fontSize: '13px', color: 'rgba(26,26,26,0.48)', fontFamily: 'var(--font-body)', maxWidth: '340px', lineHeight: 1.7, margin: 0 }}>Leading fashion influencers styling our handcrafted ensembles.</p>
          </div>
          <div style={{ display: 'flex', gap: '20px', overflowX: 'auto', paddingBottom: '8px', scrollSnapType: 'x mandatory' }} className="scrollbar-none">
            {[
              { name: 'Aditi Rao Hydari', design: 'Rose Chanderi Anarkali', img: '/lookbook-hotspot.webp' },
              { name: 'Dia Mirza', design: 'Classic Ivory Cotton Kurta', img: '/lookbook-banner.webp' },
              { name: 'Kiran Rao', design: 'Indigo Linen Block-Print', img: '/lookbook-outdoor.webp' },
              { name: 'Sonam Kapoor', design: 'Terracotta Festive Kurta', img: '/hero-woman.webp' },
            ].map((cel, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                style={{ width: '280px', flexShrink: 0, borderRadius: '12px', overflow: 'hidden', border: '1px solid #E6E2D8', scrollSnapAlign: 'start', cursor: 'pointer' }} className="celeb-card">
                <div style={{ position: 'relative', aspectRatio: '3/4', backgroundColor: '#EDE9DF' }}>
                  <Image src={cel.img} alt={cel.name} fill className="object-cover celeb-img" sizes="280px" />
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(12,8,6,0.8) 0%, transparent 55%)' }} />
                  <div style={{ position: 'absolute', bottom: '20px', left: '20px', right: '20px', color: '#fff' }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', margin: '0 0 4px', fontWeight: 400 }}>{cel.name}</h3>
                    <p style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(244,236,225,0.65)', margin: 0, fontFamily: 'var(--font-body)' }}>Styling: {cel.design}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: '1px solid #E6E2D8', backgroundColor: '#F5F2EC', padding: '48px 0' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '24px' }}>
          <Link href="/" style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: '#1A1A1A', opacity: 0.6, fontStyle: 'italic', textDecoration: 'none' }}>Minaara Creation</Link>
          <nav style={{ display: 'flex', gap: '32px' }}>
            {[{ href: '/', label: 'Collection' }, { href: '/lookbook', label: 'Lookbook' }, { href: '/cart', label: 'Cart' }].map((l) => (
              <Link key={l.href} href={l.href} style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(26,26,26,0.38)', textDecoration: 'none', fontFamily: 'var(--font-body)' }}>{l.label}</Link>
            ))}
          </nav>
          <p style={{ fontSize: '11px', color: 'rgba(26,26,26,0.28)', fontFamily: 'var(--font-body)', margin: 0 }}>© {new Date().getFullYear()} Minaara Creation</p>
        </div>
      </footer>

      <style>{`
        /* Marquee animations */
        .marquee-row-ltr { animation: marquee-ltr 38s linear infinite; }
        .marquee-row-rtl { animation: marquee-rtl 42s linear infinite; }
        @keyframes marquee-ltr { from { transform: translateX(0); } to { transform: translateX(-33.33%); } }
        @keyframes marquee-rtl { from { transform: translateX(-33.33%); } to { transform: translateX(0); } }

        /* Image hover */
        .hx-card .hx-img { transition: transform 0.65s cubic-bezier(0.76,0,0.24,1); }
        .hx-card:hover .hx-img { transform: scale(1.06); }
        .edit-card .edit-img { transition: transform 0.65s cubic-bezier(0.76,0,0.24,1); }
        .edit-card:hover .edit-img { transform: scale(1.05); }
        .celeb-card .celeb-img { transition: transform 0.65s cubic-bezier(0.76,0,0.24,1); }
        .celeb-card:hover .celeb-img { transform: scale(1.05); }

        /* Skeleton shimmer */
        @keyframes shimmer { 0%,100%{opacity:.4} 50%{opacity:.8} }

        /* Responsive overrides */
        @media (max-width: 1100px) {
          [style*="repeat(4,1fr)"] { grid-template-columns: repeat(3,1fr) !important; }
        }
        @media (max-width: 768px) {
          [style*="repeat(4,1fr)"] { grid-template-columns: repeat(2,1fr) !important; }
          [style*="1fr 1fr"] { grid-template-columns: 1fr !important; }
          [style*="repeat(3,1fr)"] { grid-template-columns: 1fr !important; }
          [style*="padding: 0 48px"] { padding: 0 20px !important; }
        }
      `}</style>
      </div>
    </main>
  );
}

// ── Product Card — Fixed so size tray never shifts grid rows ─────────────────
interface PCProps { product: Product; fmt: (p: number) => string; onAdd: (size: string) => void; }

function ProductCard({ product, fmt, onAdd }: PCProps) {
  const [hovered, setHovered]     = useState(false);
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
        borderRadius: '12px', overflow: 'visible', /* overflow visible so tray can overlay outside */
        backgroundColor: '#FAF8F5', cursor: 'pointer',
        transition: 'box-shadow 0.35s ease, transform 0.35s ease, z-index 0s',
        boxShadow: hovered ? '0 24px 60px rgba(26,26,26,0.14)' : '0 2px 8px rgba(26,26,26,0.04)',
        transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
        position: 'relative',
        zIndex: hovered ? 50 : 1, /* rise above the row below when hovered */
      }}
    >
      <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid #E6E2D8' }}>
        <Link href={`/product/${product.id}`} style={{ textDecoration: 'none', display: 'block' }}>
          {/* Image */}
          <div style={{ position: 'relative', aspectRatio: '3/4', overflow: 'hidden', backgroundColor: '#EDE9DF' }}>
            {product.images[0] && (
              <Image src={product.images[0]} alt={product.title} fill className="object-cover"
                style={{ transition: 'transform 0.65s cubic-bezier(0.76,0,0.24,1)', transform: hovered ? 'scale(1.06)' : 'scale(1)' }}
                sizes="(max-width: 768px) 50vw, 25vw" />
            )}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(12,8,6,0.2) 0%, transparent 50%)', opacity: hovered ? 1 : 0, transition: 'opacity 0.4s ease' }} />
            <span style={{ position: 'absolute', top: '12px', left: '12px', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 10px', borderRadius: '4px', backgroundColor: 'rgba(250,248,245,0.95)', color: '#1A1A1A', fontFamily: 'var(--font-body)', fontWeight: 600, border: '1px solid #E6E2D8', backdropFilter: 'blur(4px)' }}>
              {product.category}
            </span>
          </div>
          {/* Info */}
          <div style={{ padding: '14px 16px 16px', backgroundColor: '#FAF8F5' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '0.92rem', fontWeight: 400, color: '#1A1A1A', margin: '0 0 4px', letterSpacing: '0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.title}</h3>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: '#8C6F63', margin: 0, fontWeight: 500 }}>{fmt(product.priceINR)}</p>
          </div>
        </Link>
      </div>

      {/* Quick-add tray — ABSOLUTELY POSITIONED below the card, overlays, doesn't shift rows */}
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
        boxShadow: hovered ? '0 12px 32px rgba(26,26,26,0.12)' : 'none',
      }}>
        <div style={{ padding: '10px 16px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {availSizes.map(([size]) => (
            <button key={size}
              onMouseEnter={() => setHoverSize(size)} onMouseLeave={() => setHoverSize('')}
              onClick={(e) => { e.preventDefault(); onAdd(size); }}
              style={{ fontSize: '10px', padding: '4px 10px', border: '1px solid #8C6F63', borderRadius: '4px', backgroundColor: hoverSize === size ? '#8C6F63' : 'transparent', color: hoverSize === size ? '#fff' : '#1A1A1A', cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.15s ease' }}
              aria-label={`Add ${size}`}>{size}</button>
          ))}
          {firstAvail && (
            <button onClick={(e) => { e.preventDefault(); onAdd(firstAvail); }}
              style={{ fontSize: '10px', padding: '4px 12px', borderRadius: '4px', marginLeft: 'auto', backgroundColor: '#1A1A1A', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 500 }}
              aria-label="Quick add">+ Cart</button>
          )}
        </div>
      </div>
    </article>
  );
}
