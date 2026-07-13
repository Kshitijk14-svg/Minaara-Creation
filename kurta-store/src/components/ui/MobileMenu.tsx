'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { useCurrency } from '@/components/providers/CurrencyProvider';

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  session: any;
  wishlistCount: number;
  cartCount: number;
}

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const drawerVariants = {
  hidden: { x: '100%' },
  visible: { x: 0, transition: { ease: [0.22, 1, 0.36, 1] as const, duration: 0.4 } },
  exit: { x: '100%', transition: { ease: 'easeIn' as const, duration: 0.25 } },
};

const NAV_LINK_STYLE: React.CSSProperties = {
  display: 'block', textDecoration: 'none', fontFamily: 'var(--font-body)',
  fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.14em',
  color: 'var(--color-brand-charcoal)', padding: '12px 0',
};

const SECTION_LABEL_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-body)', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.2em', color: 'var(--color-brand-charcoal)', opacity: 0.35, margin: '0 0 4px',
};

const CountBadge = ({ count }: { count: number }) =>
  count > 0 ? (
    <span
      className="w-[18px] h-[18px] rounded-full bg-[#8C6F63] text-white text-[9px] flex items-center justify-center font-mono font-bold"
      style={{ marginLeft: '8px' }}
    >
      {count}
    </span>
  ) : null;

export function MobileMenu({ isOpen, onClose, session, wishlistCount, cartCount }: MobileMenuProps) {
  const { currency, setCurrency } = useCurrency();
  const pathname = usePathname();

  // Close on route change
  useEffect(() => {
    if (isOpen) onClose();
  }, [pathname]); // eslint-disable-line

  // Close on Escape, lock body scroll while open
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={{ duration: 0.25 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, zIndex: 150, backgroundColor: 'rgba(44,44,44,0.72)' }}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
          />

          <motion.div
            variants={drawerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 155,
              width: '85vw', maxWidth: '360px', height: '100%', overflowY: 'auto',
              backgroundColor: 'var(--glass-bg)',
              backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
              borderLeft: '1px solid var(--glass-border)',
              boxShadow: 'var(--glass-shadow)',
            }}
          >
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: '20px' }}>
                <button
                  onClick={onClose}
                  className="w-9 h-9 flex items-center justify-center rounded-full border"
                  style={{ borderColor: 'var(--color-brand-mauve)' }}
                  aria-label="Close menu"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M2 2L14 14M14 2L2 14" stroke="var(--color-brand-charcoal)" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              {/* Navigate */}
              <div style={{ marginBottom: '20px' }}>
                <p style={SECTION_LABEL_STYLE}>Navigate</p>
                <Link href="/" style={NAV_LINK_STYLE}>Home</Link>
                <Link href="/collection" style={NAV_LINK_STYLE}>Collection</Link>
              </div>

              <div className="section-divider is-visible" style={{ marginBottom: '20px' }} />

              {/* Account */}
              <div style={{ marginBottom: '20px' }}>
                <p style={SECTION_LABEL_STYLE}>Account</p>
                <Link href={session ? '/profile' : '/login'} style={NAV_LINK_STYLE}>
                  {session ? 'Profile' : 'Login'}
                </Link>
                <Link href="/wishlist" style={{ ...NAV_LINK_STYLE, display: 'flex', alignItems: 'center' }}>
                  Wishlist
                  <CountBadge count={wishlistCount} />
                </Link>
                <Link href="/cart" style={{ ...NAV_LINK_STYLE, display: 'flex', alignItems: 'center' }}>
                  Cart
                  <CountBadge count={cartCount} />
                </Link>
              </div>

              <div className="section-divider is-visible" style={{ marginBottom: '20px' }} />

              {/* Currency */}
              <div>
                <p style={SECTION_LABEL_STYLE}>Currency</p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['INR', 'USD', 'EUR'] as const).map((c) => (
                    <button
                      key={c}
                      onClick={() => setCurrency(c)}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: '6px',
                        border: `1px solid ${currency === c ? '#8C6F63' : 'var(--color-brand-mist)'}`,
                        backgroundColor: currency === c ? '#8C6F63' : 'transparent',
                        color: currency === c ? '#ffffff' : 'var(--color-brand-charcoal)',
                        fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: currency === c ? 600 : 400,
                        cursor: 'pointer', transition: 'all 0.2s',
                      }}
                    >
                      {c} {c === 'INR' ? '(₹)' : c === 'USD' ? '($)' : '(€)'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
