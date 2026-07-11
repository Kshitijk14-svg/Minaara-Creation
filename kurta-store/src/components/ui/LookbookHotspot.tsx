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
          className="absolute rounded-xl shadow-2xl overflow-hidden z-20 transition-all duration-300"
          style={{
            width: 'min(208px, calc(100vw - 32px))',
            ...(anchorV === 'above'
              ? { bottom: 'calc(100% + 14px)' }
              : { top: 'calc(100% + 14px)' }),
            ...(anchorH === 'left'
              ? { left: 0 }
              : anchorH === 'right'
              ? { right: 0 }
              : { left: '50%', transform: 'translateX(-50%)' }),
            backgroundColor: 'rgba(250, 248, 245, 0.97)',
            border: '1px solid var(--glass-border)',
            boxShadow: '0 8px 32px rgba(15,42,91,0.16)',
            opacity: isOpen ? 1 : 0,
            visibility: isOpen ? 'visible' : 'hidden',
            pointerEvents: isOpen ? 'auto' : 'none',
            transform: `${anchorH === 'center' ? 'translateX(-50%) ' : ''}translateY(${isOpen ? '0' : anchorV === 'above' ? '8px' : '-8px'})`,
          }}
        >
          {data.product.images && data.product.images.length > 0 && (
            <div className="relative h-48 w-full bg-black/5">
              <Image
                src={data.product.images[0]}
                alt={data.product.title}
                fill
                className="object-cover"
                sizes="208px"
              />
            </div>
          )}
          <div className="p-3 bg-transparent">
            <h4 className="text-sm font-semibold truncate" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-brand-charcoal)' }}>{data.product.title}</h4>
            <p className="text-xs mt-0.5" style={{ fontFamily: 'var(--font-body)', color: 'var(--color-brand-charcoal)', opacity: 0.7 }}>₹{data.product.priceINR.toLocaleString('en-IN')}</p>
            <div className="mt-3 flex flex-col gap-2">
              <button
                onClick={() => setIsModalOpen(true)}
                className="w-full text-center text-xs py-1.5 text-white rounded-md transition-colors font-medium cursor-pointer"
                style={{ backgroundColor: 'var(--color-brand-charcoal)', fontFamily: 'var(--font-body)' }}
              >
                Quick Add
              </button>
              <Link
                href={`/product/${data.product.slug}`}
                className="w-full text-center text-xs py-1.5 bg-black/5 rounded-md hover:bg-black/10 transition-colors font-medium"
                style={{ color: 'var(--color-brand-charcoal)', fontFamily: 'var(--font-body)' }}
              >
                View Details
              </Link>
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
