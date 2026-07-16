'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { useCart } from '@/components/providers/CartProvider';
import { useWishlist } from '@/components/providers/WishlistProvider';
import { useCurrency } from '@/components/providers/CurrencyProvider';
import { MagneticLink } from '@/components/ui/MagneticLink';
import { SearchBar } from '@/components/ui/SearchBar';
import { MobileMenu } from '@/components/ui/MobileMenu';

const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
);

const UserIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
    <circle cx="12" cy="7" r="4"></circle>
  </svg>
);

const HamburgerIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="7" x2="21" y2="7"></line>
    <line x1="3" y1="12" x2="21" y2="12"></line>
    <line x1="3" y1="17" x2="21" y2="17"></line>
  </svg>
);

interface NavbarProps {
  session: any;
}

export function Navbar({ session }: NavbarProps) {
  const [scrollDir, setScrollDir] = useState<'up' | 'down'>('up');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isCurrencyOpen, setIsCurrencyOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const pathname = usePathname();

  const { items } = useCart();
  const { count: wishlistCount } = useWishlist();
  const { currency, setCurrency } = useCurrency();
  const cartCount = items.reduce((s, i) => s + i.quantity, 0);

  useEffect(() => {
    let lastScroll = window.scrollY;
    const handleScroll = () => {
      const currentScroll = window.scrollY;

      if (currentScroll > lastScroll && currentScroll > 80) {
        setScrollDir('down');
      } else if (currentScroll < lastScroll) {
        setScrollDir('up');
      }
      lastScroll = currentScroll;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isCurrencyOpen) return;
    const handleClose = () => setIsCurrencyOpen(false);
    window.addEventListener('click', handleClose);
    return () => window.removeEventListener('click', handleClose);
  }, [isCurrencyOpen]);

  return (
    <>
      <nav
        style={{
          position: 'sticky', top: 0, zIndex: 60,
          background: '#EDE6DE',
          borderBottom: '1px solid var(--glass-border)',
          transform: scrollDir === 'down' && !isSearchOpen ? 'translateY(-100%)' : 'translateY(0)',
          transition: 'all 0.4s cubic-bezier(0.22, 1, 0.36, 1)'
        }}
      >
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 48px' }} className="flex items-center justify-between h-16 w-full">

          {/* Left Navigation Items */}
          <div className="flex items-center gap-4 lg:flex-1 lg:gap-8">
            <div className="navbar-logo-mobile">
              <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
                <Image src="/minaara-logo.jpeg" alt="Minara" width={40} height={40} style={{ objectFit: 'contain', borderRadius: '4px' }} />
              </Link>
            </div>
            <div className="navbar-desktop-only items-center gap-6 lg:gap-8">
              {[{ href: '/', label: 'Home' }, { href: '/collection', label: 'Collection' }].map((l) => {
                const isActive = l.href === '/' ? pathname === '/' : pathname === l.href;
                return (
                  <MagneticLink as="div" key={l.href}>
                    <div style={{ position: 'relative', padding: '6px 0' }}>
                      <Link
                        href={l.href}
                        style={{ textDecoration: 'none' }}
                        className={`text-[10px] uppercase tracking-[0.14em] text-[#1A1A1A] font-body font-medium transition-opacity ${isActive ? 'opacity-100' : 'opacity-65 hover:opacity-100'
                          }`}
                      >
                        {l.label}
                      </Link>
                      {isActive && (
                        <motion.div
                          layoutId="activeNavIndicator"
                          style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            height: '1px',
                            backgroundColor: '#8C6F63',
                          }}
                          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                        />
                      )}
                    </div>
                  </MagneticLink>
                );
              })}
            </div>
          </div>

          {/* Logo Center (desktop only) */}
          <div className="navbar-desktop-only lg:flex-1 justify-center">
            <div className="navbar-logo-desktop">
              <Link href="/" style={{ textDecoration: 'none', fontFamily: 'var(--font-display)', fontSize: '1.875rem', color: '#1A1A1A', letterSpacing: '0.05em', fontWeight: 300 }}>
                Label Minara
              </Link>
            </div>
          </div>

          {/* Right Navigation Items */}
          <div className="flex items-center justify-end lg:flex-1">
          <div className="navbar-mobile-only items-center gap-1">
            <button
              onClick={() => setIsSearchOpen(true)}
              aria-label="Open search"
              className="flex items-center"
              style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '6px', color: '#1A1A1A', opacity: 0.75 }}
            >
              <SearchIcon />
            </button>
            <button
              onClick={() => setIsMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={isMenuOpen}
              className="flex items-center"
              style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '6px', color: '#1A1A1A', opacity: 0.75 }}
            >
              <HamburgerIcon />
            </button>
          </div>
          <div className="navbar-desktop-only items-center gap-4 lg:gap-6">

            {/* Custom Currency Dropdown */}
            <div style={{ position: 'relative' }} className="navbar-desktop-only">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCurrencyOpen(!isCurrencyOpen);
                }}
                style={{ border: 'none', background: 'none', cursor: 'pointer', outline: 'none' }}
                className="text-[10px] uppercase tracking-[0.14em] text-[#1A1A1A] opacity-65 hover:opacity-100 font-body font-medium transition-opacity flex items-center gap-1.5"
                aria-label="Select currency"
              >
                {currency}
                <span
                  style={{
                    fontSize: '6px',
                    display: 'inline-block',
                    transition: 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
                    transform: isCurrencyOpen ? 'rotate(180deg)' : 'rotate(0deg)'
                  }}
                >
                  ▼
                </span>
              </button>

              <AnimatePresence>
                {isCurrencyOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ ease: [0.22, 1, 0.36, 1], duration: 0.25 }}
                    style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      marginTop: '12px',
                      backgroundColor: 'var(--glass-bg)',
                      backdropFilter: 'blur(20px)',
                      WebkitBackdropFilter: 'blur(20px)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: '8px',
                      padding: '6px',
                      boxShadow: 'var(--glass-shadow)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                      zIndex: 100,
                      minWidth: '95px'
                    }}
                  >
                    {['INR', 'USD', 'EUR'].map((c) => (
                      <button
                        key={c}
                        onClick={() => {
                          setCurrency(c as 'INR' | 'USD' | 'EUR');
                          setIsCurrencyOpen(false);
                        }}
                        style={{
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          padding: '6px 12px',
                          borderRadius: '4px',
                          textAlign: 'left',
                          fontFamily: 'var(--font-body)',
                          fontSize: '10px',
                          fontWeight: currency === c ? 600 : 400,
                          color: currency === c ? '#8C6F63' : '#1A1A1A',
                          backgroundColor: currency === c ? 'rgba(140, 111, 99, 0.05)' : 'transparent',
                          transition: 'all 0.2s'
                        }}
                        className="hover:bg-[#E6E2D8]/40"
                      >
                        {c} {c === 'INR' ? '(₹)' : c === 'USD' ? '($)' : '(€)'}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              aria-label="Search"
              aria-expanded={isSearchOpen}
              style={{
                border: 'none',
                background: isSearchOpen ? 'rgba(15, 42, 91, 0.07)' : 'none',
                cursor: 'pointer',
                padding: '6px 8px',
                borderRadius: '8px',
                color: '#1A1A1A',
                opacity: isSearchOpen ? 1 : 0.65,
                display: 'flex', alignItems: 'center',
                transition: 'all 0.2s',
              }}
              className="hover:opacity-100"
            >
              <SearchIcon />
            </button>

            <Link
              href={session ? '/profile' : '/login'}
              className="text-[#1A1A1A] opacity-65 hover:opacity-100 transition-opacity flex items-center"
              aria-label="User Profile"
            >
              <UserIcon />
            </Link>

            <MagneticLink as="div">
              <Link href="/wishlist" style={{ textDecoration: 'none' }} className="text-[10px] uppercase tracking-[0.14em] text-[#1A1A1A] opacity-65 hover:opacity-100 font-body font-medium flex items-center gap-2 transition-opacity">
                Wishlist
                {wishlistCount > 0 && (
                  <motion.span
                    key={wishlistCount}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-4 h-4 md:w-[18px] md:h-[18px] rounded-full bg-[#8C6F63] text-white text-[9px] flex items-center justify-center font-mono font-bold"
                  >
                    {wishlistCount}
                  </motion.span>
                )}
              </Link>
            </MagneticLink>

            <MagneticLink as="div">
              <Link href="/cart" style={{ textDecoration: 'none' }} className="text-[10px] uppercase tracking-[0.14em] text-[#1A1A1A] opacity-65 hover:opacity-100 font-body font-medium flex items-center gap-2 transition-opacity">
                Cart
                {cartCount > 0 && (
                  <motion.span
                    key={cartCount}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-4 h-4 md:w-[18px] md:h-[18px] rounded-full bg-[#8C6F63] text-white text-[9px] flex items-center justify-center font-mono font-bold"
                  >
                    {cartCount}
                  </motion.span>
                )}
              </Link>
            </MagneticLink>
          </div>
          </div>
        </div>
      </nav>
      <SearchBar isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
      <MobileMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} session={session} wishlistCount={wishlistCount} cartCount={cartCount} />
    </>
  );
}

