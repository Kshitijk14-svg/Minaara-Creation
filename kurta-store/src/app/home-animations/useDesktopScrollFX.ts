'use client';

import { useEffect, type RefObject, type MutableRefObject } from 'react';

interface Stat { value: number; suffix: string; label: string; }

export interface ScrollFXRefs {
  heroRef: RefObject<HTMLDivElement | null>;
  lookbookImgRef: RefObject<HTMLDivElement | null>;
  hFeatRef: RefObject<HTMLDivElement | null>;
  hFeatWrapRef: RefObject<HTMLDivElement | null>;
  hFeatTrackRef: RefObject<HTMLDivElement | null>;
  hAboutRef: RefObject<HTMLDivElement | null>;
  hAboutWrapRef: RefObject<HTMLDivElement | null>;
  hAboutTrackRef: RefObject<HTMLDivElement | null>;
  statsRef: RefObject<HTMLElement | null>;
  statsValueRefs: MutableRefObject<(HTMLDivElement | null)[]>;
}

// Full GSAP/ScrollTrigger rig — pinned horizontal scroll, parallax, clip-path
// reveals. Desktop-only: gsap/ScrollTrigger are dynamically imported here, so
// disabling this hook (mobile) means those chunks are never fetched at all.
export function useDesktopScrollFX(enabled: boolean, refs: ScrollFXRefs, stats: Stat[]) {
  useEffect(() => {
    if (!enabled) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let mm: gsap.MatchMedia | null = null;
    let cancelled = false;

    (async () => {
      const { gsap } = await import('gsap');
      const { ScrollTrigger } = await import('gsap/ScrollTrigger');
      // Bail if this effect's cleanup already ran (e.g. the user navigated away
      // before these dynamic imports resolved) — otherwise this stale callback
      // still creates a matchMedia context/ScrollTriggers that nothing will ever
      // revert, leaking pins that stack on top of the next mount's own.
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);

      mm = gsap.matchMedia();

      // 1. Desktop-only horizontal pinned animations (width >= 1024px)
      mm.add("(min-width: 1024px)", () => {
        // Featured Pieces horizontal scroll (pinned)
        if (refs.hFeatRef.current && refs.hFeatTrackRef.current && refs.hFeatWrapRef.current) {
          const track = refs.hFeatTrackRef.current;
          const naturalOverflow = track.scrollWidth - window.innerWidth + 96;
          if (naturalOverflow > 0) {
            const getTotal = () => track.scrollWidth - window.innerWidth + 96;
            gsap.to(track, {
              x: () => -getTotal(), ease: 'none',
              scrollTrigger: {
                trigger: refs.hFeatRef.current, start: 'top top', end: () => `+=${getTotal()}`,
                scrub: true, pin: true, anticipatePin: 1, invalidateOnRefresh: true,
              },
            });
          } else {
            refs.hFeatWrapRef.current.style.height = 'auto';
          }
        }

        // About Us horizontal scroll (pinned)
        if (refs.hAboutRef.current && refs.hAboutTrackRef.current && refs.hAboutWrapRef.current) {
          const track = refs.hAboutTrackRef.current;
          const naturalOverflow = track.scrollWidth - window.innerWidth + 96;
          if (naturalOverflow > 0) {
            const getTotal = () => track.scrollWidth - window.innerWidth + 96;
            gsap.to(track, {
              x: () => -getTotal(), ease: 'none',
              scrollTrigger: {
                trigger: refs.hAboutRef.current, start: 'top top', end: () => `+=${getTotal()}`,
                scrub: true, pin: true, anticipatePin: 1, invalidateOnRefresh: true,
              },
            });
          } else {
            refs.hAboutWrapRef.current.style.height = 'auto';
          }
        }
      });

      // 2. Animations running on all screens (min-width: 0px)
      mm.add("(min-width: 0px)", () => {
        // Hero parallax + fade-out
        if (refs.heroRef.current) {
          gsap.to(refs.heroRef.current.querySelector('.hero-content'), {
            opacity: 0, y: -80, scale: 0.97,
            scrollTrigger: { trigger: refs.heroRef.current, start: 'top top', end: 'bottom top', scrub: 1 },
          });
          gsap.to(refs.heroRef.current.querySelectorAll('img'), {
            yPercent: 18, ease: 'none',
            scrollTrigger: { trigger: refs.heroRef.current, start: 'top top', end: 'bottom top', scrub: true },
          });
        }

        // Lookbook image parallax
        if (refs.lookbookImgRef.current) {
          gsap.to(refs.lookbookImgRef.current.querySelector('img'), {
            yPercent: -14, ease: 'none',
            scrollTrigger: { trigger: refs.lookbookImgRef.current, start: 'top bottom', end: 'bottom top', scrub: true },
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
        if (refs.statsRef.current) {
          ScrollTrigger.create({
            trigger: refs.statsRef.current, start: 'top 75%', once: true,
            onEnter: () => {
              stats.forEach((stat, i) => {
                const obj = { val: 0 };
                gsap.to(obj, {
                  val: stat.value, duration: 2.2, ease: 'power2.out',
                  onUpdate() {
                    const el = refs.statsValueRefs.current[i];
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
    };
  }, [enabled]);
}
