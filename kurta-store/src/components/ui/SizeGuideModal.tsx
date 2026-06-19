'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SizeGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SizeRow {
  size: string;
  chest: string;
  waist: string;
  hips: string;
  length: string;
}

const SIZE_DATA: SizeRow[] = [
  { size: 'XS', chest: '32"', waist: '26"', hips: '34"', length: '46"' },
  { size: 'S',  chest: '34"', waist: '28"', hips: '36"', length: '46"' },
  { size: 'M',  chest: '36"', waist: '30"', hips: '38"', length: '47"' },
  { size: 'L',  chest: '38"', waist: '32"', hips: '40"', length: '47"' },
  { size: 'XL', chest: '40"', waist: '34"', hips: '42"', length: '48"' },
  { size: 'XXL',chest: '42"', waist: '36"', hips: '44"', length: '48"' },
];

const SIZE_DATA_CM: SizeRow[] = [
  { size: 'XS', chest: '81cm', waist: '66cm', hips: '86cm', length: '117cm' },
  { size: 'S',  chest: '86cm', waist: '71cm', hips: '91cm', length: '117cm' },
  { size: 'M',  chest: '91cm', waist: '76cm', hips: '97cm', length: '119cm' },
  { size: 'L',  chest: '97cm', waist: '81cm', hips: '102cm', length: '119cm' },
  { size: 'XL', chest: '102cm',waist: '86cm', hips: '107cm', length: '122cm' },
  { size: 'XXL',chest: '107cm',waist: '91cm', hips: '112cm', length: '122cm' },
];

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const drawerVariants = {
  hidden: { x: '100%' },
  visible: { x: 0, transition: { ease: [0.22, 1, 0.36, 1], duration: 0.4 } },
  exit: { x: '100%', transition: { ease: 'easeIn', duration: 0.25 } },
};

export function SizeGuideModal({ isOpen, onClose }: SizeGuideModalProps) {
  const [unit, setUnit] = React.useState<'in' | 'cm'>('in');
  const rows = unit === 'in' ? SIZE_DATA : SIZE_DATA_CM;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal-overlay justify-end items-stretch sm:items-center"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Size guide"
        >
          <motion.div
            className="relative h-full sm:h-auto sm:max-h-[90vh] w-full sm:max-w-lg rounded-l-2xl sm:rounded-2xl overflow-y-auto"
            style={{
              backgroundColor: 'var(--glass-bg)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid var(--glass-border)',
              boxShadow: 'var(--glass-shadow)',
            }}
            variants={drawerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2
                  className="text-2xl"
                  style={{ fontFamily: 'var(--font-display)', color: 'var(--color-brand-charcoal)' }}
                >
                  Size Guide
                </h2>
                <button
                  onClick={onClose}
                  className="w-9 h-9 flex items-center justify-center rounded-full border"
                  style={{ borderColor: 'var(--color-brand-mauve)' }}
                  aria-label="Close size guide"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M2 2L14 14M14 2L2 14"
                      stroke="var(--color-brand-charcoal)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>

              <div className="section-divider is-visible mb-6" />

              {/* Unit toggle */}
              <div className="flex gap-2 mb-4">
                {(['in', 'cm'] as const).map((u) => (
                  <button
                    key={u}
                    onClick={() => setUnit(u)}
                    className="px-4 py-1.5 text-sm rounded-md border transition-all duration-200"
                    style={{
                      borderColor: 'var(--color-brand-mauve)',
                      backgroundColor: unit === u ? 'var(--color-brand-mauve)' : 'transparent',
                      color: unit === u ? 'white' : 'var(--color-brand-charcoal)',
                    }}
                  >
                    {u === 'in' ? 'Inches' : 'Centimetres'}
                  </button>
                ))}
              </div>

              {/* Size table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr style={{ backgroundColor: 'var(--color-brand-blush)' }}>
                      {['Size', 'Chest', 'Waist', 'Hips', 'Length'].map((h) => (
                        <th
                          key={h}
                          className="py-3 px-4 text-left font-medium uppercase text-xs tracking-wider"
                          style={{ color: 'var(--color-brand-charcoal)' }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr
                        key={row.size}
                        style={{
                          backgroundColor: i % 2 === 0 ? 'transparent' : 'var(--color-brand-mist)',
                        }}
                      >
                        <td
                          className="py-3 px-4 font-medium"
                          style={{ color: 'var(--color-brand-mauve)' }}
                        >
                          {row.size}
                        </td>
                        <td className="py-3 px-4" style={{ color: 'var(--color-brand-charcoal)' }}>{row.chest}</td>
                        <td className="py-3 px-4" style={{ color: 'var(--color-brand-charcoal)' }}>{row.waist}</td>
                        <td className="py-3 px-4" style={{ color: 'var(--color-brand-charcoal)' }}>{row.hips}</td>
                        <td className="py-3 px-4" style={{ color: 'var(--color-brand-charcoal)' }}>{row.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-4 text-xs" style={{ color: 'var(--color-brand-charcoal)', opacity: 0.6 }}>
                Measurements are approximate. For best fit, measure over your regular clothing. If between sizes, size up.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
