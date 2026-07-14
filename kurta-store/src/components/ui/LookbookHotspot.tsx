'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { QuickViewModal } from '@/components/ui/QuickViewModal';
import type { LookbookHotspotData } from '@/types/schema';
import Link from 'next/link';

interface LookbookHotspotProps {
  data: LookbookHotspotData;
}

export function LookbookHotspot({ data }: LookbookHotspotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [isOpen]);

  // Keep the popup card from spilling off the image on either axis: anchor
  // toward the free side instead of always centering/opening upward.
  const anchorH = data.x < 25 ? 'left' : data.x > 75 ? 'right' : 'center';
  const anchorV = data.y < 20 ? 'below' : 'above';

  return (
    <>
      <div
        ref={rootRef}
        className="absolute z-10"
        style={{
          left: `${data.x}%`,
          top: `${data.y}%`,
          transform: 'translate(-50%, -50%)',
        }}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        id={`hotspot-${data.id}`}
      >
        {/* Hotspot Interactive Dot */}
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label={`View product: ${data.product.title}`}
          aria-expanded={isOpen}
          className="relative flex items-center justify-center w-10 h-10 rounded-full bg-white/85 backdrop-blur-md shadow-lg border transition-transform duration-300 hover:scale-110"
          style={{ borderColor: 'rgba(196,172,112,0.55)' }}
        >
          <span
            className="w-2.5 h-2.5 rounded-full transition-transform duration-300"
            style={{ backgroundColor: 'var(--color-brand-charcoal)', transform: isOpen ? 'scale(0.8)' : 'scale(1)' }}
          />
          {!isOpen && (
            <span className="absolute inset-0 rounded-full border animate-ping opacity-40" style={{ borderColor: '#C4AC70' }} />
          )}
          <span className="absolute inset-0 rounded-full border" style={{ borderColor: 'rgba(196,172,112,0.35)' }} />
        </button>

        {/* Popup Card — toggled by tap (mobile) or hover (desktop), clamped to the visible side of the image */}
        <div
          className="absolute rounded-2xl overflow-hidden z-20 transition-all duration-300"
          style={{
            width: 'min(248px, calc(100vw - 32px))',
            ...(anchorV === 'above'
              ? { bottom: 'calc(100% + 16px)' }
              : { top: 'calc(100% + 16px)' }),
            ...(anchorH === 'left'
              ? { left: 0 }
              : anchorH === 'right'
              ? { right: 0 }
              : { left: '50%', transform: 'translateX(-50%)' }),
            backgroundColor: 'rgba(250, 248, 245, 0.97)',
            border: '1px solid rgba(196, 172, 112, 0.3)',
            boxShadow: '0 20px 48px rgba(15,42,91,0.22), 0 2px 8px rgba(15,42,91,0.08)',
            opacity: isOpen ? 1 : 0,
            visibility: isOpen ? 'visible' : 'hidden',
            pointerEvents: isOpen ? 'auto' : 'none',
            transform: `${anchorH === 'center' ? 'translateX(-50%) ' : ''}translateY(${isOpen ? '0' : anchorV === 'above' ? '8px' : '-8px'})`,
          }}
        >
          {data.product.images && data.product.images.length > 0 && (
            <div className="relative h-56 w-full bg-black/5">
              <Image
                src={data.product.images[0]}
                alt={data.product.title}
                fill
                className="object-cover"
                sizes="248px"
              />
              <div
                className="absolute inset-x-0 bottom-0 h-10"
                style={{ background: 'linear-gradient(to top, rgba(12,8,6,0.35), transparent)' }}
              />
            </div>
          )}
          <div style={{ height: '2px', background: 'linear-gradient(to right, rgba(196,172,112,0.05), rgba(196,172,112,0.85), rgba(196,172,112,0.05))' }} />
          <div className="p-4">
            <h4
              className="text-base truncate"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 500, color: 'var(--color-brand-charcoal)' }}
            >
              {data.product.title}
            </h4>
            <p
              className="text-xs mt-1"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-brand-gold)', letterSpacing: '0.03em' }}
            >
              ₹{data.product.priceINR.toLocaleString('en-IN')}
            </p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <Link
                href={`/product/${data.product.slug}`}
                className="text-[10px] uppercase tracking-[0.12em] transition-opacity hover:opacity-100"
                style={{
                  color: 'var(--color-brand-charcoal)',
                  opacity: 0.6,
                  fontFamily: 'var(--font-body)',
                  borderBottom: '1px solid rgba(26,26,26,0.3)',
                  paddingBottom: '2px',
                }}
              >
                View Details →
              </Link>
              <button
                onClick={() => setIsModalOpen(true)}
                className="text-[10px] uppercase tracking-[0.12em] rounded-full transition-transform hover:scale-105 cursor-pointer flex-shrink-0"
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'var(--color-brand-charcoal)',
                  color: '#F4ECE1',
                  fontFamily: 'var(--font-body)',
                  fontWeight: 500,
                }}
              >
                Quick Add
              </button>
            </div>
          </div>
        </div>
      </div>

      <QuickViewModal
        product={data.product}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}
