import {
  mysqlTable,
  mysqlEnum,
  varchar,
  text,
  boolean,
  int,
  double,
  datetime,
  uniqueIndex,
  index,
  customType,
} from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { randomUUID } from 'crypto';

// mysql2 returns JSON columns as raw strings (and legacy longtext columns always
// are); drizzle's built-in json() doesn't parse on read, so consumers got
// stringified JSON. This variant parses on read and handles both cases.
const parsedJson = <TData>(name: string) =>
  customType<{ data: TData; driverData: string }>({
    dataType: () => 'json',
    toDriver: (value: TData) => JSON.stringify(value),
    fromDriver: (value: unknown): TData => {
      if (typeof value === 'string') {
        try { return JSON.parse(value) as TData; } catch { /* malformed legacy row */ }
      }
      return value as TData;
    },
  })(name);

// ── Tables ────────────────────────────────────────────────────────────────────

export const users = mysqlTable('users', {
  id:        varchar('id', { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  email:     varchar('email', { length: 255 }).notNull().unique(),
  name:      varchar('name', { length: 255 }),
  passwordHash: varchar('passwordHash', { length: 255 }),
  role:      mysqlEnum('role', ['SUPER_ADMIN', 'ADMIN', 'STAFF', 'CUSTOMER']).default('CUSTOMER').notNull(),
  createdAt: datetime('createdAt').notNull().$defaultFn(() => new Date()),
  updatedAt: datetime('updatedAt').notNull().$defaultFn(() => new Date()),
}, (t) => [
  index('email_idx').on(t.email),
  index('role_idx').on(t.role),
  // Admin user list sorts by createdAt (optionally filtered by role) — avoid filesort.
  index('user_role_created_idx').on(t.role, t.createdAt),
]);

export const otps = mysqlTable('otps', {
  id:        varchar('id', { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  email:     varchar('email', { length: 255 }).notNull().unique(),
  code:      varchar('code', { length: 10 }).notNull(),
  expiresAt: datetime('expiresAt').notNull(),
  createdAt: datetime('createdAt').notNull().$defaultFn(() => new Date()),
}, (t) => [
  index('otp_email_expires_idx').on(t.email, t.expiresAt),
]);

export const collections = mysqlTable('collections', {
  id:          varchar('id', { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  name:        varchar('name', { length: 100 }).notNull().unique(),
  slug:        varchar('slug', { length: 100 }).notNull().unique(),
  description: text('description'),
  imageUrl:    varchar('imageUrl', { length: 500 }),
  isActive:    boolean('isActive').default(true).notNull(),
  sortOrder:   int('sortOrder').default(0).notNull(),
  createdAt:   datetime('createdAt').notNull().$defaultFn(() => new Date()),
  updatedAt:   datetime('updatedAt').notNull().$defaultFn(() => new Date()),
}, (t) => [
  index('coll_active_sort_idx').on(t.isActive, t.sortOrder),
  index('coll_slug_idx').on(t.slug),
]);

export const products = mysqlTable('products', {
  id:                varchar('id', { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  title:             varchar('title', { length: 255 }).notNull(),
  slug:              varchar('slug', { length: 255 }).notNull().unique(),
  description:       text('description').notNull(),
  priceINR:          double('priceINR').notNull(),
  compareAtPriceINR: double('compareAtPriceINR'),
  weightGrams:       int('weightGrams'),
  collectionId:      varchar('collectionId', { length: 36 }).notNull(),
  isActive:          boolean('isActive').default(true).notNull(),
  isFeatured:        boolean('isFeatured').default(false).notNull(),
  isBestseller:      boolean('isBestseller').default(false).notNull(),
  isNewArrival:      boolean('isNewArrival').default(false).notNull(),
  newArrivalUntil:   datetime('newArrivalUntil'),
  reelVideoUrl:       varchar('reelVideoUrl', { length: 500 }),
  reelVideoPosterUrl: varchar('reelVideoPosterUrl', { length: 500 }),
  reelVideoUpdatedAt: datetime('reelVideoUpdatedAt'),
  deletedAt:         datetime('deletedAt'),
  createdAt:         datetime('createdAt').notNull().$defaultFn(() => new Date()),
  updatedAt:         datetime('updatedAt').notNull().$defaultFn(() => new Date()),
}, (t) => [
  index('prod_coll_idx').on(t.collectionId),
  index('prod_active_created_idx').on(t.isActive, t.createdAt),
  index('prod_slug_idx').on(t.slug),
  index('prod_featured_idx').on(t.isFeatured, t.isActive),
  index('prod_deleted_idx').on(t.deletedAt),
  index('prod_bestseller_idx').on(t.isBestseller, t.isActive),
  index('prod_new_arrival_idx').on(t.isNewArrival, t.isActive),
]);

export const productSizeVariants = mysqlTable('product_size_variants', {
  id:        varchar('id', { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  productId: varchar('productId', { length: 36 }).notNull(),
  size:      mysqlEnum('size', ['XS', 'S', 'M', 'L', 'XL', 'XXL']).notNull(),
  stock:     int('stock').default(0).notNull(),
  createdAt: datetime('createdAt').notNull().$defaultFn(() => new Date()),
  updatedAt: datetime('updatedAt').notNull().$defaultFn(() => new Date()),
}, (t) => [
  uniqueIndex('variant_product_size_unique').on(t.productId, t.size),
  index('variant_product_idx').on(t.productId),
  // Low-stock cron filters WHERE stock <= 3 across the whole variants table.
  index('variant_stock_idx').on(t.stock),
]);

export const productImages = mysqlTable('product_images', {
  id:        varchar('id', { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  productId: varchar('productId', { length: 36 }).notNull(),
  url:       varchar('url', { length: 1000 }).notNull(),
  altText:   varchar('altText', { length: 255 }),
  sortOrder: int('sortOrder').default(0).notNull(),
  createdAt: datetime('createdAt').notNull().$defaultFn(() => new Date()),
}, (t) => [
  index('img_product_sort_idx').on(t.productId, t.sortOrder),
]);

export const orders = mysqlTable('orders', {
  id:               varchar('id', { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  orderNumber:      varchar('orderNumber', { length: 50 }).notNull().unique(),
  userId:           varchar('userId', { length: 36 }),
  customerEmail:    varchar('customerEmail', { length: 255 }).notNull(),
  customerPhone:    varchar('customerPhone', { length: 20 }).notNull(),
  status:           mysqlEnum('status', ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RTO_INITIATED', 'RTO_DELIVERED', 'CANCELLED', 'REFUNDED']).default('PENDING').notNull(),
  paymentStatus:    mysqlEnum('paymentStatus', ['PENDING', 'PAID', 'FAILED', 'REFUNDED']).default('PENDING').notNull(),
  paymentGatewayId: varchar('paymentGatewayId', { length: 255 }),
  paymentMethod:    varchar('paymentMethod', { length: 100 }),
  subtotalINR:      double('subtotalINR').notNull(),
  discountAmountINR: double('discountAmountINR').default(0).notNull(),
  shippingINR:      double('shippingINR').default(0).notNull(),
  totalAmountINR:   double('totalAmountINR').notNull(),
  currency:         varchar('currency', { length: 10 }).default('INR').notNull(),
  notes:            text('notes'),
  cancelledAt:      datetime('cancelledAt'),
  deliveredAt:      datetime('deliveredAt'),
  // ── Shiprocket fulfillment linkage ──
  shiprocketOrderId:    varchar('shiprocketOrderId', { length: 50 }),
  shiprocketShipmentId: varchar('shiprocketShipmentId', { length: 50 }),
  awbNumber:            varchar('awbNumber', { length: 50 }),
  courierName:          varchar('courierName', { length: 100 }),
  trackingUrl:          varchar('trackingUrl', { length: 500 }),
  shiprocketStatus:     varchar('shiprocketStatus', { length: 100 }),
  shippedAt:            datetime('shippedAt'),
  shiprocketPushError:  text('shiprocketPushError'),
  createdAt:        datetime('createdAt').notNull().$defaultFn(() => new Date()),
  updatedAt:        datetime('updatedAt').notNull().$defaultFn(() => new Date()),
}, (t) => [
  index('order_user_idx').on(t.userId),
  index('order_email_idx').on(t.customerEmail),
  index('order_status_created_idx').on(t.status, t.createdAt),
  index('order_payment_idx').on(t.paymentStatus),
  index('order_created_idx').on(t.createdAt),
  // Idempotency: a gateway payment id backs at most one order (NULLs allowed for
  // orders without a captured payment).
  uniqueIndex('order_gateway_unique').on(t.paymentGatewayId),
  index('order_shiprocket_order_idx').on(t.shiprocketOrderId),
  index('order_awb_idx').on(t.awbNumber),
]);

export const orderItems = mysqlTable('order_items', {
  id:        varchar('id', { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  orderId:   varchar('orderId', { length: 36 }).notNull(),
  productId: varchar('productId', { length: 36 }),
  variantId: varchar('variantId', { length: 36 }),
  title:     varchar('title', { length: 255 }).notNull(),
  size:      mysqlEnum('size', ['XS', 'S', 'M', 'L', 'XL', 'XXL']).notNull(),
  imageUrl:  varchar('imageUrl', { length: 1000 }),
  quantity:  int('quantity').notNull(),
  priceINR:  double('priceINR').notNull(),
}, (t) => [
  index('item_order_idx').on(t.orderId),
  index('item_product_idx').on(t.productId),
]);

export const shippingAddresses = mysqlTable('shipping_addresses', {
  id:       varchar('id', { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  orderId:  varchar('orderId', { length: 36 }).notNull().unique(),
  fullName: varchar('fullName', { length: 255 }).notNull(),
  line1:    varchar('line1', { length: 255 }).notNull(),
  line2:    varchar('line2', { length: 255 }),
  city:     varchar('city', { length: 100 }).notNull(),
  state:    varchar('state', { length: 100 }).notNull(),
  pincode:  varchar('pincode', { length: 20 }).notNull(),
  country:  varchar('country', { length: 100 }).default('India').notNull(),
});

export const coupons = mysqlTable('coupons', {
  id:                varchar('id', { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  code:              varchar('code', { length: 50 }).notNull().unique(),
  discountType:      mysqlEnum('discountType', ['PERCENT', 'FIXED']).default('PERCENT').notNull(),
  discountValue:     double('discountValue').notNull(),
  minOrderAmountINR: double('minOrderAmountINR').default(0).notNull(),
  maxDiscountINR:    double('maxDiscountINR'),
  maxUses:           int('maxUses'),
  perUserLimit:      int('perUserLimit').default(1).notNull(),
  usedCount:         int('usedCount').default(0).notNull(),
  expiryDate:        datetime('expiryDate').notNull(),
  isActive:          boolean('isActive').default(true).notNull(),
  createdAt:         datetime('createdAt').notNull().$defaultFn(() => new Date()),
  updatedAt:         datetime('updatedAt').notNull().$defaultFn(() => new Date()),
}, (t) => [
  index('coupon_code_idx').on(t.code),
  index('coupon_active_expiry_idx').on(t.isActive, t.expiryDate),
]);

export const couponUsages = mysqlTable('coupon_usages', {
  id:       varchar('id', { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  couponId: varchar('couponId', { length: 36 }).notNull(),
  userId:   varchar('userId', { length: 36 }).notNull(),
  orderId:  varchar('orderId', { length: 36 }).notNull().unique(),
  usedAt:   datetime('usedAt').notNull().$defaultFn(() => new Date()),
}, (t) => [
  uniqueIndex('coupon_usage_coupon_user_unique').on(t.couponId, t.userId),
  index('coupon_usage_coupon_idx').on(t.couponId),
  index('coupon_usage_user_idx').on(t.userId),
]);

export const designConfigs = mysqlTable('design_configs', {
  id:              varchar('id', { length: 50 }).primaryKey(),
  heroBanners:     parsedJson<Array<{ url: string; altText: string; linkHref: string }>>('heroBanners').notNull(),
  isLookbookActive: boolean('isLookbookActive').default(true).notNull(),
  activeTheme:     varchar('activeTheme', { length: 50 }).default('pastel-pink').notNull(),
  promoBannerText: text('promoBannerText'),
  heroContent:      parsedJson<{
    badgeText: string; headline: string; headlineEmphasis: string; subheading: string;
    imageUrl: string; ctaPrimaryLabel: string; ctaPrimaryHref: string;
    ctaSecondaryLabel: string; ctaSecondaryHref: string;
  }>('heroContent'),
  uspItems:         parsedJson<Array<{ icon: string; title: string; sub: string }>>('uspItems'),
  marqueeWords:     parsedJson<string[]>('marqueeWords'),
  aboutPanels:      parsedJson<Array<{ num: string; label: string; heading: string; body: string; imageUrl: string }>>('aboutPanels'),
  editorialStories: parsedJson<Array<{ chapter: string; title: string; desc: string; imageUrl: string; href: string }>>('editorialStories'),
  stats:            parsedJson<Array<{ value: number; suffix: string; label: string }>>('stats'),
  footerContent:    parsedJson<{ tagline: string; links: Array<{ href: string; label: string }> }>('footerContent'),
  haveliConfig:     parsedJson<{ imageUrl: string; heading: string; subheading: string; description: string }>('haveliConfig'),
  updatedAt:       datetime('updatedAt').notNull().$defaultFn(() => new Date()),
});

export const haveliHotspots = mysqlTable('haveli_hotspots', {
  id:        varchar('id', { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  productId: varchar('productId', { length: 36 }).notNull(),
  x:         double('x').notNull(),
  y:         double('y').notNull(),
  sortOrder: int('sortOrder').default(0).notNull(),
  createdAt: datetime('createdAt').notNull().$defaultFn(() => new Date()),
  updatedAt: datetime('updatedAt').notNull().$defaultFn(() => new Date()),
}, (t) => [
  index('haveli_hotspot_sort_idx').on(t.sortOrder),
]);

// ── New tables (added by Drizzle migration) ───────────────────────────────────

export const blogPosts = mysqlTable('blog_posts', {
  id:           varchar('id', { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  title:        varchar('title', { length: 255 }).notNull(),
  slug:         varchar('slug', { length: 255 }).notNull().unique(),
  content:      text('content').notNull(),
  excerpt:      varchar('excerpt', { length: 500 }),
  coverImageUrl: varchar('coverImageUrl', { length: 1000 }),
  isPublished:  boolean('isPublished').default(false).notNull(),
  publishedAt:  datetime('publishedAt'),
  authorId:     varchar('authorId', { length: 36 }),
  createdAt:    datetime('createdAt').notNull().$defaultFn(() => new Date()),
  updatedAt:    datetime('updatedAt').notNull().$defaultFn(() => new Date()),
}, (t) => [
  index('blog_published_idx').on(t.isPublished, t.publishedAt),
  index('blog_slug_idx').on(t.slug),
]);

export const newsletterSubscribers = mysqlTable('newsletter_subscribers', {
  id:           varchar('id', { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  email:        varchar('email', { length: 255 }).notNull().unique(),
  isActive:     boolean('isActive').default(true).notNull(),
  subscribedAt: datetime('subscribedAt').notNull().$defaultFn(() => new Date()),
});

export const testimonials = mysqlTable('testimonials', {
  id:        varchar('id', { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  name:      varchar('name', { length: 255 }).notNull(),
  city:      varchar('city', { length: 100 }),
  text:      text('text').notNull(),
  rating:    int('rating').default(5).notNull(),
  isActive:  boolean('isActive').default(true).notNull(),
  sortOrder: int('sortOrder').default(0).notNull(),
  createdAt: datetime('createdAt').notNull().$defaultFn(() => new Date()),
  updatedAt: datetime('updatedAt').notNull().$defaultFn(() => new Date()),
}, (t) => [
  index('testimonial_active_sort_idx').on(t.isActive, t.sortOrder),
]);

// ── Relations ─────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  orders:       many(orders),
  couponUsages: many(couponUsages),
}));

export const collectionsRelations = relations(collections, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  collection: one(collections, {
    fields: [products.collectionId],
    references: [collections.id],
  }),
  variants:   many(productSizeVariants),
  images:     many(productImages),
  orderItems: many(orderItems),
}));

export const productSizeVariantsRelations = relations(productSizeVariants, ({ one, many }) => ({
  product:    one(products, {
    fields: [productSizeVariants.productId],
    references: [products.id],
  }),
  orderItems: many(orderItems),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, {
    fields: [productImages.productId],
    references: [products.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user:            one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  items:           many(orderItems),
  shippingAddress: one(shippingAddresses, {
    fields: [orders.id],
    references: [shippingAddresses.orderId],
  }),
  couponUsage:     one(couponUsages, {
    fields: [orders.id],
    references: [couponUsages.orderId],
  }),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order:   one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
  variant: one(productSizeVariants, {
    fields: [orderItems.variantId],
    references: [productSizeVariants.id],
  }),
}));

export const shippingAddressesRelations = relations(shippingAddresses, ({ one }) => ({
  order: one(orders, {
    fields: [shippingAddresses.orderId],
    references: [orders.id],
  }),
}));

export const couponsRelations = relations(coupons, ({ many }) => ({
  usages: many(couponUsages),
}));

export const couponUsagesRelations = relations(couponUsages, ({ one }) => ({
  coupon: one(coupons, {
    fields: [couponUsages.couponId],
    references: [coupons.id],
  }),
  user:   one(users, {
    fields: [couponUsages.userId],
    references: [users.id],
  }),
  order:  one(orders, {
    fields: [couponUsages.orderId],
    references: [orders.id],
  }),
}));

export const blogPostsRelations = relations(blogPosts, ({ one }) => ({
  author: one(users, {
    fields: [blogPosts.authorId],
    references: [users.id],
  }),
}));
