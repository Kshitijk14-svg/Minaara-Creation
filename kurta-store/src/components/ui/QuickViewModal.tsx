'use client';

import React, { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { useCart } from '@/components/providers/CartProvider';
import { useCurrency } from '@/components/providers/CurrencyProvider';
import { trackAddToCart } from '@/lib/analytics';
import type { Product } from '@/types/schema';

interface QuickViewModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
}

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const modalVariants = {
  hidden: { opacity: 0, y: 40, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { ease: [0.22, 1, 0.36, 1], duration: 0.4 },
  },
  exit: {
    opacity: 0,
    y: 24,
    scale: 0.97,
    transition: { ease: 'easeIn', duration: 0.2 },
  },
};

export function QuickViewModal({ product, isOpen, onClose }: QuickViewModalProps) {
  const { addItem } = useCart();
  const { currency, convertPrice } = useCurrency();
  const [selectedSize, setSelectedSize] = React.useState<string>('');

  const [prevProductId, setPrevProductId] = React.useState<string | null>(null);

  if (product && product.id !== prevProductId) {
    setPrevProductId(product.id);
    const firstAvailable = Object.entries(product.sizes).find(([, stock]) => stock > 0);
    setSelectedSize(firstAvailable ? firstAvailable[0] : '');
  }

  const handleAddToCart = useCallback(() => {
    if (!product || !selectedSize) return;
    addItem({
      productId: product.id,
      title: product.title,
      size: selectedSize,
      quantity: 1,
      priceINR: product.priceINR,
      imageUrl: product.images[0] ?? '',
    });
    trackAddToCart(product, selectedSize, 1);
    onClose();
  }, [product, selectedSize, addItem, onClose]);

  const formatPrice = useCallback(
    (priceINR: number) => {
      const converted = convertPrice(priceINR);
      const symbols: Record<string, string> = { INR: '₹', USD: '$', EUR: '€' };
      return `${symbols[currency] ?? ''}${converted.toFixed(currency === 'INR' ? 0 : 2)}`;
    },
    [convertPrice, currency],
  );

  return (
    <AnimatePresence>
      {isOpen && product && (
        <motion.div
          className="modal-overlay"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={`Quick view: ${product.title}`}
        >
          <motion.div
            className="relative w-full max-w-2xl bg-brand-ivory rounded-2xl overflow-hidden shadow-2xl"
            style={{ backgroundColor: 'var(--color-brand-ivory)' }}
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-10 w-9 h-9 flex items-center justify-center rounded-full border"
              style={{ borderColor: 'var(--color-brand-mauve)', color: 'var(--color-brand-charcoal)' }}
              aria-label="Close quick view"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 2L14 14M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>

            <div className="grid grid-cols-1 sm:grid-cols-2">
              {/* Product Image */}
              <div className="relative aspect-[3/4] w-full" style={{ backgroundColor: 'var(--color-brand-blush)' }}>
                {product.images[0] && (
                  <Image
                    src={product.images[0]}
                    alt={product.title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, 50vw"
                  />
                )}
              </div>

              {/* Product Details */}
              <div className="p-6 flex flex-col gap-4">
                <div>
                  <p
                    className="text-xs uppercase tracking-widest mb-1"
                    style={{ color: 'var(--color-brand-mauve)' }}
                  >
                    {product.category}
                  </p>
                  <h2
                    className="text-2xl font-display"
                    style={{ fontFamily: 'var(--font-display)', color: 'var(--color-brand-charcoal)' }}
                  >
                    {product.title}
                  </h2>
                  <p
                    className="text-xl mt-2 font-mono"
                    style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-brand-gold)' }}
                  >
                    {formatPrice(product.priceINR)}
                  </p>
                </div>

                <div className="section-divider is-visible" />

                {/* Size Selector */}
                <div>
                  <p className="text-sm mb-2" style={{ color: 'var(--color-brand-charcoal)' }}>
                    Size
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(product.sizes).map(([size, stock]) => (
                      <button
                        key={size}
                        onClick={() => stock > 0 && setSelectedSize(size)}
                        disabled={stock === 0}
                        className={`px-3 py-1.5 text-sm border rounded-md transition-all duration-200 ${
                          selectedSize === size
                            ? 'text-white'
                            : stock === 0
                              ? 'opacity-40 cursor-not-allowed line-through'
                              : 'hover:opacity-80'
                        }`}
                        style={{
                          borderColor: 'var(--color-brand-mauve)',
                          backgroundColor: selectedSize === size ? 'var(--color-brand-mauve)' : 'transparent',
                          color: selectedSize === size ? 'white' : 'var(--color-brand-charcoal)',
                        }}
                        aria-label={`Size ${size}${stock === 0 ? ' - out of stock' : ''}`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>

                <p
                  className="text-sm leading-relaxed"
                  style={{ color: 'var(--color-brand-charcoal)', opacity: 0.75 }}
                >
                  {product.description.slice(0, 120)}
                  {product.description.length > 120 ? '…' : ''}
                </p>

                {/* Add to Cart */}
                <button
                  onClick={handleAddToCart}
                  disabled={!selectedSize}
                  className="mt-auto w-full py-3 text-sm uppercase tracking-widest rounded-md transition-all duration-300 disabled:opacity-40"
                  style={{
                    backgroundColor: 'var(--color-brand-mauve)',
                    color: 'white',
                  }}
                  id={`quick-add-to-cart-${product.id}`}
                >
                  {selectedSize ? 'Add to Cart' : 'Select a Size'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
