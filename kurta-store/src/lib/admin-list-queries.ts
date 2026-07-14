/**
 * Shared list-query logic for the admin Products/Collections/Coupons/Orders
 * tabs. Extracted so the exact same query + cache path can be invoked
 * in-process from a server component (SSR of the active admin tab) instead of
 * duplicating it, or having the server component fetch its own API route
 * over HTTP.
 */
import { db } from '@/db/index';
import {
  products, collections, productSizeVariants, productImages,
  coupons, orders, orderItems, shippingAddresses, couponUsages,
} from '@/db/schema';
import { cacheGet, cacheSet, CacheKeys, CacheTags } from '@/lib/cache';
import { and, asc, count, desc, eq, gt, inArray, isNull, like, lt, or } from 'drizzle-orm';

const PRODUCTS_TTL         = 600;
const COLLECTIONS_TTL      = 3600;
const COLLECTIONS_ADMIN_TTL = 30;
const COUPON_LIST_TTL      = 300;
const ORDERS_ADMIN_TTL     = 60;

function buildSizesMap(variants: Array<{ size: string; stock: number }>) {
  const map: Record<string, number> = { XS: 0, S: 0, M: 0, L: 0, XL: 0, XXL: 0 };
  for (const v of variants) map[v.size] = v.stock;
  return map;
}

// ── Products ────────────────────────────────────────────────────────────────

export interface ProductsListParams {
  cursor?: string;
  limit?: number;
  collectionId?: string;
  collectionSlug?: string;
  isActiveParam?: string | null;
  isFeatured?: string | null;
  isBestseller?: string | null;
  isNewArrival?: string | null;
  search?: string;
}

export async function getProductsList(raw: ProductsListParams) {
  const limit = Math.min(raw.limit ?? 20, 100);
  const { cursor, collectionId, collectionSlug, search } = raw;
  const isActiveParam = raw.isActiveParam ?? null;
  const isFeatured    = raw.isFeatured ?? null;
  const isBestseller  = raw.isBestseller ?? null;
  const isNewArrival  = raw.isNewArrival ?? null;

  const cacheParams = new URLSearchParams({
    cursor: cursor ?? '', limit: String(limit),
    collectionId: collectionId ?? '', collectionSlug: collectionSlug ?? '',
    isActive: isActiveParam ?? '', isFeatured: isFeatured ?? '', search: search ?? '',
    isBestseller: isBestseller ?? '', isNewArrival: isNewArrival ?? '',
  }).toString();

  const cacheKey = CacheKeys.products.list(cacheParams);
  const cached   = await cacheGet(cacheKey);
  if (cached) return cached;

  let cursorDate: Date | undefined;
  if (cursor) {
    const [ci] = await db.select({ createdAt: products.createdAt }).from(products).where(eq(products.id, cursor)).limit(1);
    cursorDate = ci?.createdAt;
  }

  let resolvedCollectionId = collectionId;
  if (collectionSlug && !resolvedCollectionId) {
    const [col] = await db.select({ id: collections.id }).from(collections).where(eq(collections.slug, collectionSlug)).limit(1);
    resolvedCollectionId = col?.id;
  }

  const bestsellerCondition = isBestseller === 'true' ? eq(products.isBestseller, true) : undefined;
  const newArrivalCondition = isNewArrival === 'true'
    ? and(eq(products.isNewArrival, true), or(isNull(products.newArrivalUntil), gt(products.newArrivalUntil, new Date())))
    : undefined;

  const conditions = and(
    isNull(products.deletedAt),
    resolvedCollectionId ? eq(products.collectionId, resolvedCollectionId) : undefined,
    isActiveParam !== null && isActiveParam !== '' ? eq(products.isActive, isActiveParam === 'true') : undefined,
    isFeatured === 'true' ? eq(products.isFeatured, true) : undefined,
    bestsellerCondition,
    newArrivalCondition,
    search ? like(products.title, `%${search}%`) : undefined,
    cursorDate ? lt(products.createdAt, cursorDate) : undefined,
  );

  const countConditions = and(
    isNull(products.deletedAt),
    resolvedCollectionId ? eq(products.collectionId, resolvedCollectionId) : undefined,
    isActiveParam !== null && isActiveParam !== '' ? eq(products.isActive, isActiveParam === 'true') : undefined,
    isFeatured === 'true' ? eq(products.isFeatured, true) : undefined,
    bestsellerCondition,
    newArrivalCondition,
    search ? like(products.title, `%${search}%`) : undefined,
  );

  const [rows, [{ total }]] = await Promise.all([
    db.select({
      id: products.id, title: products.title, slug: products.slug,
      description: products.description, priceINR: products.priceINR,
      compareAtPriceINR: products.compareAtPriceINR, weightGrams: products.weightGrams,
      collectionId: products.collectionId,
      isActive: products.isActive, isFeatured: products.isFeatured,
      isBestseller: products.isBestseller, isNewArrival: products.isNewArrival,
      newArrivalUntil: products.newArrivalUntil,
      createdAt: products.createdAt, updatedAt: products.updatedAt, deletedAt: products.deletedAt,
      collectionName: collections.name, collectionSlug: collections.slug,
    })
      .from(products)
      .leftJoin(collections, eq(products.collectionId, collections.id))
      .where(conditions)
      .orderBy(desc(products.createdAt))
      .limit(limit + 1),
    db.select({ total: count() }).from(products).where(countConditions),
  ]);

  const hasMore    = rows.length > limit;
  const page       = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  const pageIds = page.map((p) => p.id);
  const variantMap = new Map<string, Array<{ id: string; productId: string; size: string; stock: number }>>();
  const imageMap   = new Map<string, Array<{ id: string; productId: string; url: string; altText: string | null; sortOrder: number }>>();

  if (pageIds.length > 0) {
    const [varRows, imgRows] = await Promise.all([
      db.select({ id: productSizeVariants.id, productId: productSizeVariants.productId, size: productSizeVariants.size, stock: productSizeVariants.stock })
        .from(productSizeVariants).where(inArray(productSizeVariants.productId, pageIds)).orderBy(asc(productSizeVariants.size)),
      db.select({ id: productImages.id, productId: productImages.productId, url: productImages.url, altText: productImages.altText, sortOrder: productImages.sortOrder })
        .from(productImages).where(inArray(productImages.productId, pageIds)).orderBy(asc(productImages.sortOrder)),
    ]);
    for (const v of varRows) { if (!variantMap.has(v.productId)) variantMap.set(v.productId, []); variantMap.get(v.productId)!.push(v); }
    for (const img of imgRows) { if (!imageMap.has(img.productId)) imageMap.set(img.productId, []); imageMap.get(img.productId)!.push(img); }
  }

  const result = {
    data: page.map((p) => {
      const variants = variantMap.get(p.id) ?? [];
      const images   = imageMap.get(p.id) ?? [];
      return {
        ...p,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        deletedAt: p.deletedAt?.toISOString() ?? null,
        newArrivalUntil: p.newArrivalUntil?.toISOString() ?? null,
        category: p.collectionName || '',
        collection: { id: p.collectionId, name: p.collectionName, slug: p.collectionSlug },
        sizes: buildSizesMap(variants),
        variants,
        images: images.map((img) => img.url),
        normalizedImages: images,
      };
    }),
    nextCursor,
    total,
  };

  await cacheSet(cacheKey, result, [CacheTags.products], PRODUCTS_TTL);
  return result;
}

// ── Collections ─────────────────────────────────────────────────────────────

export interface CollectionsListParams {
  includeInactive?: boolean;
  limit?: number;
  cursor?: string;
}

export async function getCollectionsList(raw: CollectionsListParams) {
  const includeInactive = raw.includeInactive ?? false;
  const paginated = raw.limit !== undefined;
  const limit     = paginated ? Math.min(Math.max(raw.limit ?? 20, 1), 100) : undefined;
  const cursor    = raw.cursor;

  const cacheKey = paginated
    ? null
    : includeInactive ? 'collections:admin:all' : CacheKeys.collections.list();

  if (cacheKey) {
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;
  }

  let cursorRow: { sortOrder: number; name: string } | undefined;
  if (paginated && cursor) {
    const [row] = await db.select({ sortOrder: collections.sortOrder, name: collections.name }).from(collections).where(eq(collections.id, cursor)).limit(1);
    cursorRow = row;
  }

  const baseQuery = () => db
    .select({
      id: collections.id, name: collections.name, slug: collections.slug,
      description: collections.description, imageUrl: collections.imageUrl,
      isActive: collections.isActive, sortOrder: collections.sortOrder,
      createdAt: collections.createdAt, updatedAt: collections.updatedAt,
      productCount: count(products.id),
    })
    .from(collections)
    .leftJoin(products, and(eq(products.collectionId, collections.id), eq(products.isActive, true), isNull(products.deletedAt)))
    .where(and(
      includeInactive ? undefined : eq(collections.isActive, true),
      cursorRow
        ? or(gt(collections.sortOrder, cursorRow.sortOrder), and(eq(collections.sortOrder, cursorRow.sortOrder), gt(collections.name, cursorRow.name)))
        : undefined,
    ))
    .groupBy(collections.id)
    .orderBy(asc(collections.sortOrder), asc(collections.name));

  const rows = paginated ? await baseQuery().limit(limit! + 1) : await baseQuery();

  const serialize = (c: any) => ({
    ...c,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
  });

  let result: { data: ReturnType<typeof serialize>[]; total: number; nextCursor?: string | null };
  if (paginated) {
    const hasMore = rows.length > limit!;
    const page    = hasMore ? rows.slice(0, limit) : rows;
    result = { data: page.map(serialize), total: page.length, nextCursor: hasMore ? page[page.length - 1].id : null };
  } else {
    result = { data: rows.map(serialize), total: rows.length };
  }

  if (cacheKey) {
    await cacheSet(cacheKey, result, [CacheTags.collections], includeInactive ? COLLECTIONS_ADMIN_TTL : COLLECTIONS_TTL);
  }
  return result;
}

// ── Coupons ─────────────────────────────────────────────────────────────────

export interface CouponsListParams {
  cursor?: string;
  limit?: number;
  isActive?: string | null;
  search?: string;
}

function serializeCoupon(c: any) {
  return {
    ...c,
    discountPercent: c.discountType === 'PERCENT' ? c.discountValue : undefined,
    expiryDate: c.expiryDate instanceof Date ? c.expiryDate.toISOString() : c.expiryDate,
    createdAt:  c.createdAt instanceof Date  ? c.createdAt.toISOString()  : c.createdAt,
    updatedAt:  c.updatedAt instanceof Date  ? c.updatedAt.toISOString()  : c.updatedAt,
  };
}

export async function getCouponsList(raw: CouponsListParams) {
  const limit = Math.min(raw.limit ?? 20, 100);
  const { cursor, search } = raw;
  const isActive = raw.isActive ?? null;

  const cacheParams = new URLSearchParams({ cursor: cursor ?? '', limit: String(limit), isActive: isActive ?? '', search: search ?? '' }).toString();
  const cacheKey = CacheKeys.coupons.list(cacheParams);
  const cached   = await cacheGet(cacheKey);
  if (cached) return cached;

  let cursorDate: Date | undefined;
  if (cursor) {
    const [ci] = await db.select({ createdAt: coupons.createdAt }).from(coupons).where(eq(coupons.id, cursor)).limit(1);
    cursorDate = ci?.createdAt;
  }

  const whereConditions = and(
    isActive !== null && isActive !== '' ? eq(coupons.isActive, isActive === 'true') : undefined,
    search ? like(coupons.code, `%${search}%`) : undefined,
    cursorDate ? lt(coupons.createdAt, cursorDate) : undefined,
  );

  const [rows, [{ total }]] = await Promise.all([
    db.select().from(coupons).where(whereConditions).orderBy(desc(coupons.createdAt)).limit(limit + 1),
    db.select({ total: count() }).from(coupons).where(
      and(
        isActive !== null && isActive !== '' ? eq(coupons.isActive, isActive === 'true') : undefined,
        search ? like(coupons.code, `%${search}%`) : undefined,
      )
    ),
  ]);

  const hasMore    = rows.length > limit;
  const page       = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  const result = { data: page.map(serializeCoupon), nextCursor, total };
  await cacheSet(cacheKey, result, [CacheTags.coupons], COUPON_LIST_TTL);
  return result;
}

// ── Orders (admin) ───────────────────────────────────────────────────────────

export interface OrdersAdminListParams {
  cursor?: string;
  limit?: number;
  status?: string;
  paymentStatus?: string;
  email?: string;
}

function serializeOrder(o: any) {
  const { couponUsage, ...rest } = o;
  return {
    ...rest,
    coupon:      couponUsage?.coupon ?? null,
    createdAt:   o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt,
    updatedAt:   o.updatedAt instanceof Date ? o.updatedAt.toISOString() : o.updatedAt,
    cancelledAt: o.cancelledAt instanceof Date ? o.cancelledAt.toISOString() : o.cancelledAt ?? null,
    deliveredAt: o.deliveredAt instanceof Date ? o.deliveredAt.toISOString() : o.deliveredAt ?? null,
    shippedAt:   o.shippedAt instanceof Date ? o.shippedAt.toISOString() : o.shippedAt ?? null,
  };
}

/** Admin-scoped order list (no per-user filter). Mirrors `GET /api/orders`'s admin branch. */
export async function getOrdersAdminList(raw: OrdersAdminListParams) {
  const limit = Math.min(raw.limit ?? 20, 100);
  const { cursor, status: statusFilter, paymentStatus: paymentFilter, email: emailFilter } = raw;

  const cacheParams = new URLSearchParams({
    cursor: cursor ?? '', limit: String(limit),
    status: statusFilter ?? '', paymentStatus: paymentFilter ?? '', email: emailFilter ?? '',
  }).toString();

  const cacheKey = CacheKeys.orders.adminList(cacheParams);
  const cached   = await cacheGet(cacheKey);
  if (cached) return cached;

  let cursorDate: Date | undefined;
  if (cursor) {
    const [ci] = await db.select({ createdAt: orders.createdAt }).from(orders).where(eq(orders.id, cursor)).limit(1);
    cursorDate = ci?.createdAt;
  }

  const conditions = and(
    emailFilter ? like(orders.customerEmail, `%${emailFilter}%`) : undefined,
    statusFilter  ? eq(orders.status,        statusFilter  as any) : undefined,
    paymentFilter ? eq(orders.paymentStatus, paymentFilter as any) : undefined,
    cursorDate    ? lt(orders.createdAt,     cursorDate)           : undefined,
  );

  const countConditions = and(
    emailFilter ? like(orders.customerEmail, `%${emailFilter}%`) : undefined,
    statusFilter  ? eq(orders.status,        statusFilter  as any) : undefined,
    paymentFilter ? eq(orders.paymentStatus, paymentFilter as any) : undefined,
  );

  const [rows, [{ total }]] = await Promise.all([
    db.select({
      id: orders.id, orderNumber: orders.orderNumber, userId: orders.userId,
      customerEmail: orders.customerEmail, customerPhone: orders.customerPhone,
      status: orders.status, paymentStatus: orders.paymentStatus,
      discountAmountINR: orders.discountAmountINR, subtotalINR: orders.subtotalINR,
      totalAmountINR: orders.totalAmountINR, currency: orders.currency,
      createdAt: orders.createdAt, updatedAt: orders.updatedAt,
      cancelledAt: orders.cancelledAt, deliveredAt: orders.deliveredAt,
      paymentGatewayId: orders.paymentGatewayId, paymentMethod: orders.paymentMethod,
      notes: orders.notes,
      shiprocketOrderId: orders.shiprocketOrderId, shiprocketShipmentId: orders.shiprocketShipmentId,
      awbNumber: orders.awbNumber, courierName: orders.courierName, trackingUrl: orders.trackingUrl,
      shiprocketStatus: orders.shiprocketStatus, shippedAt: orders.shippedAt,
      shiprocketPushError: orders.shiprocketPushError,
    })
      .from(orders)
      .where(conditions)
      .orderBy(desc(orders.createdAt))
      .limit(limit + 1),
    db.select({ total: count() }).from(orders).where(countConditions),
  ]);

  const hasMore    = rows.length > limit;
  const page       = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  const pageIds = page.map((o) => o.id);
  const itemMap    = new Map<string, any[]>();
  const addressMap = new Map<string, any>();
  const couponMap  = new Map<string, any>();

  if (pageIds.length > 0) {
    const [itemRows, addressRows, couponRows] = await Promise.all([
      db.select({
        orderId: orderItems.orderId, id: orderItems.id, title: orderItems.title,
        size: orderItems.size, quantity: orderItems.quantity, priceINR: orderItems.priceINR, imageUrl: orderItems.imageUrl,
      }).from(orderItems).where(inArray(orderItems.orderId, pageIds)),
      db.select().from(shippingAddresses).where(inArray(shippingAddresses.orderId, pageIds)),
      db.select({
        orderId: couponUsages.orderId, code: coupons.code, discountType: coupons.discountType, discountValue: coupons.discountValue,
      }).from(couponUsages).leftJoin(coupons, eq(couponUsages.couponId, coupons.id)).where(inArray(couponUsages.orderId, pageIds)),
    ]);
    for (const item of itemRows) { if (!itemMap.has(item.orderId)) itemMap.set(item.orderId, []); itemMap.get(item.orderId)!.push(item); }
    for (const addr of addressRows) addressMap.set(addr.orderId, addr);
    for (const cu of couponRows) couponMap.set(cu.orderId, { coupon: { code: cu.code, discountType: cu.discountType, discountValue: cu.discountValue } });
  }

  const data = page.map((o) => serializeOrder({
    ...o,
    items: itemMap.get(o.id) ?? [],
    shippingAddress: addressMap.get(o.id) ?? null,
    couponUsage: couponMap.get(o.id) ?? null,
  }));

  const result = { data, nextCursor, total };
  await cacheSet(cacheKey, result, [CacheTags.orders], ORDERS_ADMIN_TTL);
  return result;
}
