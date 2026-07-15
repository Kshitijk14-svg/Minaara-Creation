'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useIsMobile } from '@/lib/useIsMobile';

interface SearchInputRowProps {
  query: string;
  setQuery: (v: string) => void;
  loading: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onClose: () => void;
  closeLabel: string;
  variant: 'mobile' | 'desktop';
  showBottomBorder: boolean;
}

function SearchInputRow({ query, setQuery, loading, inputRef, onKeyDown, onClose, closeLabel, variant, showBottomBorder }: SearchInputRowProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: variant === 'mobile' ? '14px 16px' : '16px 20px',
      borderBottom: showBottomBorder ? '1px solid rgba(230, 226, 216, 0.6)' : 'none',
    }}>
      {/* Search icon */}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-brand-charcoal)', opacity: 0.35, flexShrink: 0 }}>
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>

      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search for kurtas, anarkalis..."
        style={{
          flex: 1, border: 'none', background: 'transparent',
          fontFamily: 'var(--font-body)', fontSize: '15px',
          color: 'var(--color-brand-charcoal)', outline: 'none',
          letterSpacing: '0.01em',
        }}
      />

      {/* Loading spinner or clear */}
      {loading && (
        <div style={{
          width: '16px', height: '16px', borderRadius: '50%',
          border: '2px solid var(--color-brand-mist)',
          borderTopColor: 'var(--color-brand-mauve)',
          animation: 'search-spin 0.7s linear infinite',
          flexShrink: 0,
        }} />
      )}
      {!loading && query && (
        <button
          onClick={() => setQuery('')}
          style={{
            border: 'none', background: 'rgba(15, 42, 91, 0.06)',
            color: 'var(--color-brand-charcoal)', opacity: 0.5,
            cursor: 'pointer', borderRadius: '50%', width: '22px', height: '22px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, transition: 'opacity 0.15s',
          }}
          aria-label="Clear search"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      )}

      <button
        onClick={onClose}
        style={
          variant === 'mobile'
            ? {
                border: 'none', background: 'none',
                fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 500,
                color: 'var(--color-brand-charcoal)', opacity: 0.6,
                cursor: 'pointer', padding: '8px 4px', flexShrink: 0,
                transition: 'opacity 0.15s',
              }
            : {
                border: 'none', background: 'none',
                fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.15em',
                color: 'var(--color-brand-charcoal)', opacity: 0.4,
                cursor: 'pointer', padding: '4px 0', flexShrink: 0,
                transition: 'opacity 0.15s',
              }
        }
      >
        {closeLabel}
      </button>
    </div>
  );
}

interface SearchResultsBlockProps {
  results: any[];
  recent: string[];
  query: string;
  loading: boolean;
  suggestions: string[];
  handleSelect: (product: any) => void;
  saveRecent: (term: string) => void;
  onClose: () => void;
  setQuery: (v: string) => void;
  maxHeight?: string;
}

function SearchResultsBlock({ results, recent, query, loading, suggestions, handleSelect, saveRecent, onClose, setQuery, maxHeight }: SearchResultsBlockProps) {
  return (
    <>
      {/* Results / Suggestions Dropdown */}
      <AnimatePresence>
        {(results.length > 0 || (query.length === 0 && recent.length > 0) || (query.length > 1 && !loading && results.length === 0)) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ maxHeight, overflowY: 'auto' }}
            className="scrollbar-none"
          >
            {/* No results */}
            {query.length > 1 && !loading && results.length === 0 && (
              <div style={{ padding: '20px 20px', textAlign: 'center' }}>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontStyle: 'italic', color: 'var(--color-brand-charcoal)', opacity: 0.35, margin: '0 0 4px' }}>
                  No results for "{query}"
                </p>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--color-brand-charcoal)', opacity: 0.3, margin: 0 }}>
                  Try a different search term
                </p>
              </div>
            )}

            {/* Search Results */}
            {results.length > 0 && (
              <div style={{ padding: '8px 0' }}>
                <p style={{ padding: '8px 20px 6px', fontFamily: 'var(--font-body)', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--color-brand-charcoal)', opacity: 0.35 }}>
                  Results
                </p>
                {results.map((p) => (
                  <Link
                    key={p.id}
                    href={`/product/${p.slug ?? p.id}`}
                    onClick={() => handleSelect(p)}
                    style={{ textDecoration: 'none', display: 'block' }}
                  >
                    <div className="search-result-item" style={{
                      display: 'flex', gap: '14px', alignItems: 'center',
                      padding: '10px 20px', transition: 'background 0.15s',
                    }}>
                      <div style={{
                        width: '44px', height: '56px', borderRadius: '6px',
                        background: 'var(--color-brand-smoke)',
                        overflow: 'hidden', flexShrink: 0, position: 'relative',
                      }}>
                        {p.images?.[0] && (
                          <Image src={p.images[0]} alt={p.title} fill className="object-cover" sizes="44px" />
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 500, color: 'var(--color-brand-charcoal)', margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p.title}
                        </p>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--color-brand-charcoal)', opacity: 0.4, margin: '0 0 4px' }}>
                          {p.category}
                        </p>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--color-brand-gold)', margin: 0, letterSpacing: '0.05em' }}>
                          ₹{p.priceINR.toLocaleString('en-IN')}
                        </p>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-brand-charcoal)', opacity: 0.2, flexShrink: 0 }}>
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                      </svg>
                    </div>
                  </Link>
                ))}

                {/* View all results link */}
                <div style={{ padding: '8px 20px 12px' }}>
                  <button
                    onClick={() => { saveRecent(query); onClose(); }}
                    style={{
                      width: '100%', padding: '10px', border: '1px solid var(--color-brand-mist)',
                      borderRadius: '8px', background: 'none', cursor: 'pointer',
                      fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600,
                      textTransform: 'uppercase', letterSpacing: '0.15em',
                      color: 'var(--color-brand-charcoal)', opacity: 0.55,
                      transition: 'all 0.2s',
                    }}
                    className="search-all-btn"
                  >
                    View all {results.length} results for "{query}"
                  </button>
                </div>
              </div>
            )}

            {/* Recent Searches (when no query) */}
            {query.length === 0 && recent.length > 0 && (
              <div style={{ padding: '8px 0 12px' }}>
                <p style={{ padding: '8px 20px 6px', fontFamily: 'var(--font-body)', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--color-brand-charcoal)', opacity: 0.35 }}>
                  Recent
                </p>
                {recent.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => setQuery(r)}
                    className="search-result-item"
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '10px 20px', border: 'none', background: 'none',
                      cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-brand-charcoal)', opacity: 0.25, flexShrink: 0 }}>
                      <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.35"/>
                    </svg>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-brand-charcoal)', opacity: 0.65 }}>
                      {r}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Suggestions Footer (when no query, no results) */}
      {query.length === 0 && (
        <div style={{
          padding: '12px 20px 16px',
          borderTop: recent.length > 0 ? '1px solid rgba(230, 226, 216, 0.6)' : 'none',
          display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
        }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--color-brand-charcoal)', opacity: 0.3, marginRight: '4px' }}>
            Trending:
          </span>
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => setQuery(s)}
              style={{
                padding: '5px 12px', border: '1px solid var(--color-brand-mist)',
                borderRadius: '100px', background: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontSize: '11px',
                color: 'var(--color-brand-charcoal)', opacity: 0.65,
                transition: 'all 0.2s',
                letterSpacing: '0.02em',
              }}
              className="search-pill-btn"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export function SearchBar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 120);
      const saved = localStorage.getItem('minaara_recent_searches');
      if (saved) {
        try { setRecent(JSON.parse(saved)); } catch {}
      }
    } else {
      setQuery('');
      setResults([]);
    }
  }, [isOpen]);

  // Close search on route change
  useEffect(() => {
    if (isOpen) onClose();
  }, [pathname]); // eslint-disable-line

  // Close on outside click (desktop dropdown only — mobile sheet is full-screen)
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const delay = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.results || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(delay);
  }, [query]);

  // Lock body scroll while search (dropdown or full-screen sheet) is open
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, [isOpen]);

  const saveRecent = (searchTerm: string) => {
    if (!searchTerm) return;
    const updated = [searchTerm, ...recent.filter(r => r !== searchTerm)].slice(0, 5);
    setRecent(updated);
    localStorage.setItem('minaara_recent_searches', JSON.stringify(updated));
  };

  const handleSelect = (product: any) => {
    saveRecent(product.title);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') saveRecent(query);
    if (e.key === 'Escape') onClose();
  };

  const suggestions = ['Festive Edit', 'Casual Wear', 'Wedding Series', 'Work Staples'];
  const showDivider = results.length > 0 || recent.length > 0 || query.length > 0;

  return (
    <>
      <AnimatePresence>
        {isOpen && isMobile === false && (
          <React.Fragment key="desktop-search">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              style={{
                position: 'fixed', inset: 0, zIndex: 90,
                background: 'rgba(15, 42, 91, 0.32)',
              }}
            />

            {/* Search Panel */}
            <motion.div
              ref={containerRef}
              initial={{ opacity: 0, y: -12, scale: 0.98, x: '-50%' }}
              animate={{ opacity: 1, y: 0, scale: 1, x: '-50%' }}
              exit={{ opacity: 0, y: -8, scale: 0.98, x: '-50%', transition: { duration: 0.2 } }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              style={{
                position: 'fixed',
                top: '72px',
                left: '50%',
                width: '100%',
                maxWidth: '680px',
                zIndex: 95,
                padding: '0 16px',
              }}
            >
              <div style={{
                background: 'rgba(250, 248, 245, 0.99)',
                borderRadius: '16px',
                border: '1px solid rgba(230,226,216,0.8)',
                boxShadow: '0 24px 64px rgba(15, 42, 91, 0.14), 0 4px 16px rgba(15, 42, 91, 0.06)',
                overflow: 'hidden',
              }}>
                <SearchInputRow
                  query={query} setQuery={setQuery} loading={loading} inputRef={inputRef}
                  onKeyDown={handleKeyDown} onClose={onClose} closeLabel="Esc" variant="desktop"
                  showBottomBorder={showDivider}
                />
                <SearchResultsBlock
                  results={results} recent={recent} query={query} loading={loading}
                  suggestions={suggestions} handleSelect={handleSelect} saveRecent={saveRecent}
                  onClose={onClose} setQuery={setQuery} maxHeight="420px"
                />
              </div>
            </motion.div>
          </React.Fragment>
        )}

        {isOpen && isMobile === true && (
          <motion.div
            key="mobile-search-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ ease: [0.22, 1, 0.36, 1], duration: 0.35 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 160,
              background: 'var(--color-brand-ivory, #FAF8F5)',
              display: 'flex', flexDirection: 'column',
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Search"
          >
            <div style={{ paddingTop: 'env(safe-area-inset-top)', flexShrink: 0 }}>
              <SearchInputRow
                query={query} setQuery={setQuery} loading={loading} inputRef={inputRef}
                onKeyDown={handleKeyDown} onClose={onClose} closeLabel="Cancel" variant="mobile"
                showBottomBorder={showDivider}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }} className="scrollbar-none">
              <SearchResultsBlock
                results={results} recent={recent} query={query} loading={loading}
                suggestions={suggestions} handleSelect={handleSelect} saveRecent={saveRecent}
                onClose={onClose} setQuery={setQuery}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes search-spin {
          to { transform: rotate(360deg); }
        }
        .search-result-item:hover {
          background: rgba(15, 42, 91, 0.04) !important;
        }
        .search-all-btn:hover {
          opacity: 1 !important;
          background: rgba(15, 42, 91, 0.04) !important;
          border-color: var(--color-brand-charcoal) !important;
        }
        .search-pill-btn:hover {
          opacity: 1 !important;
          border-color: var(--color-brand-charcoal) !important;
          background: rgba(15, 42, 91, 0.04) !important;
        }
      `}</style>
    </>
  );
}
