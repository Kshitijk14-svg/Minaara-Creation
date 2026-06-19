// ─────────────────────────────────────────────────────────────────────────────
// ENUMS / PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────

export type Currency = 'INR' | 'USD' | 'EUR';
export type SizeLabel = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED';
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
export type DiscountType = 'PERCENT' | 'FIXED';
export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'STAFF' | 'CUSTOMER';

// ─────────────────────────────────────────────────────────────────────────────
// COLLECTIONS
// ─────────────────────────────────────────────────────────────────────────────

export interface Collection {
  id: string;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  _count?: { products: number };
}

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCTS
// ─────────────────────────────────────────────────────────────────────────────

export interface ProductSizeVariant {
  id: string;
  productId: string;
  size: SizeLabel;
  stock: number;
}

export interface ProductImage {
  id: string;
  productId: string;
  url: string;
  altText?: string;
  sortOrder: number;
}

export interface Product {
  id: string;
  title: string;
  slug: string;
  description: string;
  priceINR: number;
  compareAtPriceINR?: number;
  collectionId: string;
  collection?: Pick<Collection, 'id' | 'name' | 'slug'>;
  variants: ProductSizeVariant[];
  images: string[]; // Keep as string[] for legacy UI compatibility
  normalizedImages?: ProductImage[]; // For admin dashboard or raw db uses
  isActive: boolean;
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;

  // Legacy/Compatible UI Fields (Populated by API)
  category: string; 
  sizes: Record<SizeLabel, number>;
}

// ─────────────────────────────────────────────────────────────────────────────
// ORDERS
// ─────────────────────────────────────────────────────────────────────────────

export interface OrderItem {
  id: string;
  orderId: string;
  productId?: string;
  variantId?: string;
  // Snapshot fields (frozen at purchase time)
  title: string;
  size: string;
  imageUrl?: string;
  quantity: number;
  priceINR: number;
}

export interface ShippingAddress {
  id: string;
  orderId: string;
  fullName: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId?: string;
  customerEmail: string;
  customerPhone: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentGatewayId?: string;
  paymentMethod?: string;
  discountAmountINR: number;
  subtotalINR: number;
  totalAmountINR: number;
  currency: Currency;
  notes?: string;
  cancelledAt?: string;
  deliveredAt?: string;
  createdAt: string;
  updatedAt: string;
  // Relations
  items: OrderItem[];
  shippingAddress?: ShippingAddress;
  coupon?: Pick<Coupon, 'code' | 'discountType' | 'discountValue'>;
}

// ─────────────────────────────────────────────────────────────────────────────
// COUPONS
// ─────────────────────────────────────────────────────────────────────────────

export interface Coupon {
  id: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  minOrderAmountINR: number;
  maxDiscountINR?: number;
  maxUses?: number;
  usedCount: number;
  perUserLimit: number;
  expiryDate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;

  // Legacy support fields:
  discountPercent?: number; 
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGINATION
// ─────────────────────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
  total: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN CONFIG
// ─────────────────────────────────────────────────────────────────────────────

export interface HeroBanner {
  url: string;
  altText: string;
  linkHref: string;
}

export interface DesignConfig {
  id: string;
  heroBanners: HeroBanner[];
  isLookbookActive: boolean;
  activeTheme: string;
  promoBannerText?: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CART (client-side only, not persisted)
// ─────────────────────────────────────────────────────────────────────────────

export interface CartItem {
  productId: string;
  variantId: string;
  title: string;
  size: SizeLabel;
  imageUrl: string;
  quantity: number;
  priceINR: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// CURRENCY RATES (cached, not DB)
// ─────────────────────────────────────────────────────────────────────────────

export interface CurrencyRates {
  INR: number;
  USD: number;
  EUR: number;
  fetchedAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOOKBOOK
// ─────────────────────────────────────────────────────────────────────────────

export interface LookbookHotspotData {
  id: string;
  x: number;
  y: number;
  product: Product;
}

