export type Currency = 'INR' | 'USD' | 'EUR';

export interface ProductImage {
  url: string;
}

export interface SizeMap {
  XS?: number;
  S?: number;
  M?: number;
  L?: number;
  XL?: number;
  XXL?: number;
}

export interface Product {
  id: string;
  title: string;
  description: string;
  priceINR: number;
  images: string[];      // Cloudinary URLs
  sizes: SizeMap;
  category: string;
  isActive: boolean;
  createdAt: string;
}

export interface OrderItem {
  productId: string;
  title: string;
  size: string;
  quantity: number;
  priceINR: number;
}

export interface ShippingAddress {
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
  customerEmail: string;
  customerPhone: string;
  shippingAddress: ShippingAddress;
  items: OrderItem[];
  totalAmountINR: number;
  currency: Currency;
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED';
  paymentGatewayId?: string;
  createdAt: string;
}

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

export interface Coupon {
  id: string;
  code: string;
  discountPercent: number;
  expiryDate: string;
  isActive: boolean;
}

export interface CartItem extends OrderItem {
  imageUrl: string;
}

export interface CurrencyRates {
  INR: number;
  USD: number;
  EUR: number;
  fetchedAt: number; // Unix timestamp
}

export interface LookbookHotspotData {
  id: string;
  x: number;       // percentage (0-100) of image width
  y: number;       // percentage (0-100) of image height
  product: Product;
}
