'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { QuickViewModal } from '@/components/ui/QuickViewModal';
import type { LookbookHotspotData } from '@/types/schema';
import Link from 'next/link';

interface LookbookHotspotProps {
  data: LookbookHotspotData;
}

export function LookbookHotspot({ data }: LookbookHotspotProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div
        className="absolute z-10 group"
        style={{
          left: `${data.x}%`,
          top: `${data.y}%`,
          transform: 'translate(-50%, -50%)',
        }}
        aria-label={`View product: ${data.product.title}`}
        id={`hotspot-${data.id}`}
      >
        {/* Hotspot Interactive Dot */}
        <button
          className="relative flex items-center justify-center w-8 h-8 rounded-full bg-white/80 backdrop-blur-md shadow-lg border border-white/40 transition-transform duration-300 hover:scale-110"
          onClick={() => setIsModalOpen(true)}
        >
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: 'var(--color-brand-charcoal)' }} />
          <span className="absolute inset-0 rounded-full border animate-ping opacity-50" style={{ borderColor: 'var(--color-brand-charcoal)' }} />
        </button>

        {/* Hover Mini Card */}
        <div 
          className="absolute left-1/2 -translate-x-1/2 bottom-full mb-4 w-48 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 translate-y-2 group-hover:translate-y-0 overflow-hidden z-20 pointer-events-auto"
          style={{
            backgroundColor: 'rgba(250, 248, 245, 0.97)',
            border: '1px solid var(--glass-border)',
            boxShadow: '0 8px 32px rgba(15,42,91,0.12)',
          }}
        >
          {data.product.images && data.product.images.length > 0 && (
            <div className="relative h-48 w-full bg-black/5">
              <Image
                src={data.product.images[0]}
                alt={data.product.title}
                fill
                className="object-cover"
                sizes="192px"
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
          
          {/* Arrow pointing down */}
          <div 
            className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent" 
            style={{ borderTopColor: 'var(--glass-bg)' }}
          />
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
