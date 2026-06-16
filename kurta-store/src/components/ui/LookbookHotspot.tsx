'use client';

import React, { useState } from 'react';
import { QuickViewModal } from '@/components/ui/QuickViewModal';
import type { LookbookHotspotData } from '@/types/schema';

interface LookbookHotspotProps {
  data: LookbookHotspotData;
}

export function LookbookHotspot({ data }: LookbookHotspotProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <button
        className="absolute z-10 group"
        style={{
          left: `${data.x}%`,
          top: `${data.y}%`,
          transform: 'translate(-50%, -50%)',
        }}
        onClick={() => setIsModalOpen(true)}
        aria-label={`View product: ${data.product.title}`}
        id={`hotspot-${data.id}`}
      >
        {/* Pulsing ring — pure CSS, no JS */}
        <span className="hotspot-pulse block" />

        {/* Tooltip on hover */}
        <span
          className="absolute left-1/2 -translate-x-1/2 bottom-full mb-3 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none shadow-lg"
          style={{
            backgroundColor: 'var(--color-brand-charcoal)',
            color: 'white',
            fontFamily: 'var(--font-body)',
          }}
        >
          {data.product.title}
          <span
            className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent"
            style={{ borderTopColor: 'var(--color-brand-charcoal)' }}
          />
        </span>
      </button>

      <QuickViewModal
        product={data.product}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}
