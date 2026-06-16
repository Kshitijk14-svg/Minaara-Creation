import type { Product, CartItem } from '@/types/schema';

// Extend Window for gtag and fbq
declare global {
  interface Window {
    gtag: (command: string, ...args: unknown[]) => void;
    fbq: (command: string, eventName: string, params?: Record<string, unknown>) => void;
  }
}

export function trackViewItem(product: Product): void {
  if (typeof window === 'undefined') return;

  // GA4 — view_item event (standard e-commerce schema)
  if (typeof window.gtag === 'function') {
    window.gtag('event', 'view_item', {
      currency: 'INR',
      value: product.priceINR,
      items: [
        {
          item_id: product.id,
          item_name: product.title,
          item_category: product.category,
          price: product.priceINR,
          quantity: 1,
        },
      ],
    });
  }

  // Meta Pixel — ViewContent event
  if (typeof window.fbq === 'function') {
    window.fbq('track', 'ViewContent', {
      content_ids: [product.id],
      content_name: product.title,
      content_category: product.category,
      value: product.priceINR,
      currency: 'INR',
    });
  }
}

export function trackAddToCart(product: Product, size: string, quantity: number): void {
  if (typeof window === 'undefined') return;

  const value = product.priceINR * quantity;

  // GA4 — add_to_cart event
  if (typeof window.gtag === 'function') {
    window.gtag('event', 'add_to_cart', {
      currency: 'INR',
      value,
      items: [
        {
          item_id: product.id,
          item_name: product.title,
          item_category: product.category,
          item_variant: size,
          price: product.priceINR,
          quantity,
        },
      ],
    });
  }

  // Meta Pixel — AddToCart event
  if (typeof window.fbq === 'function') {
    window.fbq('track', 'AddToCart', {
      content_ids: [product.id],
      content_name: product.title,
      content_category: product.category,
      value,
      currency: 'INR',
      num_items: quantity,
    });
  }
}

export function trackPurchase(orderId: string, items: CartItem[], totalINR: number): void {
  if (typeof window === 'undefined') return;

  // GA4 — purchase event
  if (typeof window.gtag === 'function') {
    window.gtag('event', 'purchase', {
      transaction_id: orderId,
      currency: 'INR',
      value: totalINR,
      items: items.map((item) => ({
        item_id: item.productId,
        item_name: item.title,
        item_variant: item.size,
        price: item.priceINR,
        quantity: item.quantity,
      })),
    });
  }

  // Meta Pixel — Purchase event
  if (typeof window.fbq === 'function') {
    window.fbq('track', 'Purchase', {
      value: totalINR,
      currency: 'INR',
      content_ids: items.map((item) => item.productId),
      num_items: items.reduce((acc, item) => acc + item.quantity, 0),
    });
  }
}

export function trackViewItemList(products: Product[]): void {
  if (typeof window === 'undefined') return;

  if (typeof window.gtag === 'function') {
    window.gtag('event', 'view_item_list', {
      items: products.map((product, index) => ({
        item_id: product.id,
        item_name: product.title,
        item_category: product.category,
        price: product.priceINR,
        index,
      })),
    });
  }
}
