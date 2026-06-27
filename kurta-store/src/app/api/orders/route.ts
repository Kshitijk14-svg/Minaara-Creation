/**
 * POST /api/orders  — create order with ACID transaction (stock check + decrement + coupon claim)
 * GET  /api/orders  — paginated list (admin: all, customer: own orders)
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db/index';
import {
  orders, orderItems, shippingAddresses,
  products, productSizeVariants, productImages,
  coupons, couponUsages,
} from '@/db/schema';
import { isAuthorized, getSession } from '@/lib/api-auth';
import {
  cacheGet, cacheSet, invalidateTags,
  CacheKeys, CacheTags,
} from '@/lib/cache';
import { and, asc, count, desc, eq, gte, inArray, isNull, like, lt, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

const ORDERS_ADMIN_TTL = 60;
const ORDERS_USER_TTL  = 120;

const ShippingAddressSchema = z.object({
  fullName: z.string().min(1),
  line1:    z.string().min(1),
  line2:    z.string().optional(),
  city:     z.string().min(1),
  state:    z.string().min(1),
  pincode:  z.string().min(4).max(10),
  country:  z.string().min(1).default('India'),
});

const OrderItemInputSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid(),
  size:      z.enum(['XS', 'S', 'M', 'L', 'XL', 'XXL']),
  quantity:  z.number().int().positive(),
});

const CreateOrderSchema = z.object({
  customerEmail:   z.string().email(),
  customerPhone:   z.string().min(10).max(15),
  shippingAddress: ShippingAddressSchema,
  items:           z.array(OrderItemInputSchema).min(1),
  currency:        z.enum(['INR', 'USD', 'EUR']).default('INR'),
  couponCode:      z.string().optional(),
  notes:           z.string().optional(),
});

function generateOrderNumber(): string {
  const date   = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `MNC-${date}-${random}`;
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
  };
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const userId  = (session?.user as any)?.id as string | undefined;

    const body   = await request.json();
    const parsed = CreateOrderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid order data', issues: parsed.error.issues }, { status: 400 });
    }

    const { items, shippingAddress, couponCode, ...orderData } = parsed.data;

    // ── ACID Transaction ──────────────────────────────────────────────────────
    const result = await db.transaction(async (tx) => {
      const variantIds = items.map((i) => i.variantId);
      const productIds = [...new Set(items.map((i) => i.productId))];

      // 1. Lock variant rows (pessimistic lock prevents concurrent stock race)
      await tx.execute(
        sql.raw(`SELECT id, stock FROM product_size_variants WHERE id IN ('${variantIds.join("','")}') FOR UPDATE`)
      );

      const variantRows = await tx
        .select({
          id:        productSizeVariants.id,
          productId: productSizeVariants.productId,
          size:      productSizeVariants.size,
          stock:     productSizeVariants.stock,
        })
        .from(productSizeVariants)
        .where(inArray(productSizeVariants.id, variantIds));

      if (variantRows.length !== variantIds.length) {
        throw new Error('VARIANT_NOT_FOUND: One or more product variants not found');
      }

      // 2. Check all products are active
      const activeProducts = await tx
        .select({ id: products.id })
        .from(products)
        .where(and(
          inArray(products.id, productIds),
          eq(products.isActive, true),
          isNull(products.deletedAt),
        ));

      if (activeProducts.length !== productIds.length) {
        throw new Error('PRODUCT_INACTIVE: One or more products are not available');
      }

      // Fetch product titles and first images for snapshots
      const productRows = await tx
        .select({
          id:      products.id,
          title:   products.title,
          priceINR: products.priceINR,
        })
        .from(products)
        .where(inArray(products.id, productIds));

      const imageRows = await tx
        .select({ productId: productImages.productId, url: productImages.url })
        .from(productImages)
        .where(and(
          inArray(productImages.productId, productIds),
          eq(productImages.sortOrder, 0),
        ));

      const productMap = new Map(productRows.map((p) => [p.id, p]));
      const imageMap   = new Map(imageRows.map((img) => [img.productId, img.url]));
      const variantMap = new Map(variantRows.map((v) => [v.id, v]));

      // 3. Validate stock
      for (const item of items) {
        const variant = variantMap.get(item.variantId);
        if (!variant) throw new Error(`VARIANT_NOT_FOUND: Variant ${item.variantId}`);
        if (variant.stock < item.quantity) {
          const prod = productMap.get(item.productId);
          throw new Error(
            `INSUFFICIENT_STOCK: "${prod?.title || 'Product'}" size ${item.size} — available: ${variant.stock}, requested: ${item.quantity}`
          );
        }
      }

      // 4. Validate coupon
      let coupon: any = null;
      let discountAmountINR = 0;
      if (couponCode) {
        if (!userId) throw new Error('COUPON_REQUIRES_LOGIN: Must be logged in to use a coupon');

        const cleanCode = couponCode.toUpperCase().trim();
        // Lock coupon row
        await tx.execute(
          sql.raw(`SELECT id, usedCount FROM coupons WHERE code = '${cleanCode.replace(/'/g, "''")}' FOR UPDATE`)
        );

        const [couponRow] = await tx
          .select()
          .from(coupons)
          .where(eq(coupons.code, cleanCode))
          .limit(1);

        if (!couponRow)          throw new Error('COUPON_INVALID: Coupon not found');
        if (!couponRow.isActive) throw new Error('COUPON_INACTIVE: Coupon is not active');
        if (couponRow.expiryDate < new Date()) throw new Error('COUPON_EXPIRED: Coupon has expired');
        if (couponRow.maxUses !== null && couponRow.usedCount >= couponRow.maxUses) {
          throw new Error('COUPON_EXHAUSTED: Coupon has reached its maximum uses');
        }

        const [{ perUserUsage }] = await tx
          .select({ perUserUsage: count() })
          .from(couponUsages)
          .where(and(eq(couponUsages.couponId, couponRow.id), eq(couponUsages.userId, userId)));

        if (perUserUsage >= couponRow.perUserLimit) {
          throw new Error('COUPON_PER_USER_LIMIT: You have already used this coupon');
        }

        coupon = couponRow;
      }

      // 5. Calculate totals
      const subtotalINR = items.reduce((sum, item) => {
        const product = productMap.get(item.productId)!;
        return sum + product.priceINR * item.quantity;
      }, 0);

      if (coupon) {
        if (subtotalINR < coupon.minOrderAmountINR) {
          throw new Error(`COUPON_MIN_ORDER: Minimum order amount for this coupon is ₹${coupon.minOrderAmountINR}`);
        }
        if (coupon.discountType === 'PERCENT') {
          discountAmountINR = (subtotalINR * coupon.discountValue) / 100;
          if (coupon.maxDiscountINR) discountAmountINR = Math.min(discountAmountINR, coupon.maxDiscountINR);
        } else {
          discountAmountINR = Math.min(coupon.discountValue, subtotalINR);
        }
      }

      const totalAmountINR = subtotalINR - discountAmountINR;

      // 6. Create order
      const orderId = randomUUID();
      await tx.insert(orders).values({
        id: orderId,
        orderNumber:      generateOrderNumber(),
        userId:           userId ?? null,
        customerEmail:    orderData.customerEmail,
        customerPhone:    orderData.customerPhone,
        currency:         orderData.currency,
        notes:            orderData.notes ?? null,
        discountAmountINR,
        subtotalINR,
        totalAmountINR,
      });

      // 7. Create shipping address
      await tx.insert(shippingAddresses).values({
        id:       randomUUID(),
        orderId,
        ...shippingAddress,
        line2: shippingAddress.line2 ?? null,
      });

      // 8. Create order items
      await tx.insert(orderItems).values(
        items.map((item) => {
          const product = productMap.get(item.productId)!;
          return {
            id:        randomUUID(),
            orderId,
            productId: item.productId,
            variantId: item.variantId,
            title:     product.title,
            size:      item.size,
            imageUrl:  imageMap.get(item.productId) ?? null,
            quantity:  item.quantity,
            priceINR:  product.priceINR,
          };
        })
      );

      // 9. Decrement stock (DB-level guard via WHERE stock >= quantity)
      for (const item of items) {
        const updated = await tx.update(productSizeVariants)
          .set({ stock: sql`stock - ${item.quantity}`, updatedAt: new Date() })
          .where(and(
            eq(productSizeVariants.id, item.variantId),
            gte(productSizeVariants.stock, item.quantity),
          ));

        if ((updated as any)[0]?.affectedRows === 0) {
          const v = variantMap.get(item.variantId);
          const p = productMap.get(item.productId);
          throw new Error(
            `CONCURRENT_INSUFFICIENT_STOCK: "${p?.title || 'Product'}" size ${item.size} — stock was reduced concurrently`
          );
        }
      }

      // 10. Record coupon usage
      if (coupon) {
        await tx.insert(couponUsages).values({
          id:       randomUUID(),
          couponId: coupon.id,
          userId:   userId!,
          orderId,
        });
        await tx.update(coupons)
          .set({ usedCount: sql`usedCount + 1`, updatedAt: new Date() })
          .where(and(
            eq(coupons.id, coupon.id),
            coupon.maxUses !== null ? sql`usedCount < ${coupon.maxUses}` : sql`1=1`,
          ));
      }

      return { orderId, orderNumber: generateOrderNumber() };
    });
    // ── End Transaction ───────────────────────────────────────────────────────

    // Fetch actual order number (generated inside tx)
    const [newOrder] = await db
      .select({ orderNumber: orders.orderNumber })
      .from(orders)
      .where(eq(orders.id, result.orderId))
      .limit(1);

    const tagsToInvalidate: string[] = [CacheTags.orders];
    if (userId) tagsToInvalidate.push(CacheTags.ordersByUser(userId));
    await invalidateTags(tagsToInvalidate);

    return NextResponse.json({ orderId: result.orderId, orderNumber: newOrder?.orderNumber }, { status: 201 });
  } catch (err: any) {
    const knownPrefixes = [
      'VARIANT_NOT_FOUND', 'PRODUCT_INACTIVE', 'INSUFFICIENT_STOCK',
      'COUPON_INVALID', 'COUPON_INACTIVE', 'COUPON_EXPIRED',
      'COUPON_EXHAUSTED', 'COUPON_PER_USER_LIMIT', 'COUPON_MIN_ORDER',
      'COUPON_REQUIRES_LOGIN',
      'CONCURRENT_INSUFFICIENT_STOCK', 'CONCURRENT_COUPON_EXHAUSTED',
    ];
    for (const prefix of knownPrefixes) {
      if (err?.message?.startsWith(prefix + ':')) {
        return NextResponse.json({ error: err.message.split(': ').slice(1).join(': ') }, { status: 422 });
      }
    }
    if (process.env.NODE_ENV !== 'production') console.error('[POST /api/orders]', err);
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cursor        = searchParams.get('cursor') ?? undefined;
    const limit         = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);
    const statusFilter  = searchParams.get('status') ?? undefined;
    const paymentFilter = searchParams.get('paymentStatus') ?? undefined;
    const emailFilter   = searchParams.get('email') ?? undefined;

    const session = await getSession();
    const userId  = (session?.user as any)?.id as string | undefined;
    const admin   = await isAuthorized(request);

    if (!admin && !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = new URLSearchParams({
      cursor: cursor ?? '', limit: String(limit),
      status: statusFilter ?? '', paymentStatus: paymentFilter ?? '',
      email: admin ? (emailFilter ?? '') : '',
    }).toString();

    const cacheKey = admin
      ? CacheKeys.orders.adminList(params)
      : CacheKeys.orders.userList(userId!, params);

    const cached = await cacheGet(cacheKey);
    if (cached) return NextResponse.json(cached);

    // Resolve cursor
    let cursorDate: Date | undefined;
    if (cursor) {
      const [ci] = await db.select({ createdAt: orders.createdAt }).from(orders).where(eq(orders.id, cursor)).limit(1);
      cursorDate = ci?.createdAt;
    }

    const conditions = and(
      !admin ? eq(orders.userId, userId!) : undefined,
      admin && emailFilter ? like(orders.customerEmail, `%${emailFilter}%`) : undefined,
      statusFilter  ? eq(orders.status,        statusFilter  as any) : undefined,
      paymentFilter ? eq(orders.paymentStatus, paymentFilter as any) : undefined,
      cursorDate    ? lt(orders.createdAt,     cursorDate)           : undefined,
    );

    const countConditions = and(
      !admin ? eq(orders.userId, userId!) : undefined,
      admin && emailFilter ? like(orders.customerEmail, `%${emailFilter}%`) : undefined,
      statusFilter  ? eq(orders.status,        statusFilter  as any) : undefined,
      paymentFilter ? eq(orders.paymentStatus, paymentFilter as any) : undefined,
    );

    const [rows, [{ total }]] = await Promise.all([
      db.select({
        id:               orders.id, orderNumber: orders.orderNumber, userId: orders.userId,
        customerEmail:    orders.customerEmail, customerPhone: orders.customerPhone,
        status:           orders.status, paymentStatus: orders.paymentStatus,
        discountAmountINR: orders.discountAmountINR, subtotalINR: orders.subtotalINR,
        totalAmountINR:   orders.totalAmountINR, currency: orders.currency,
        createdAt:        orders.createdAt, updatedAt: orders.updatedAt,
        cancelledAt:      orders.cancelledAt, deliveredAt: orders.deliveredAt,
        paymentGatewayId: orders.paymentGatewayId, paymentMethod: orders.paymentMethod,
        notes:            orders.notes,
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

    // Attach items, shipping addresses, and coupon usages
    const pageIds = page.map((o) => o.id);
    const itemMap     = new Map<string, any[]>();
    const addressMap  = new Map<string, any>();
    const couponMap   = new Map<string, any>();

    if (pageIds.length > 0) {
      const [itemRows, addressRows, couponRows] = await Promise.all([
        db.select({
          orderId:  orderItems.orderId,
          id:       orderItems.id,
          title:    orderItems.title,
          size:     orderItems.size,
          quantity: orderItems.quantity,
          priceINR: orderItems.priceINR,
          imageUrl: orderItems.imageUrl,
        }).from(orderItems).where(inArray(orderItems.orderId, pageIds)),
        db.select().from(shippingAddresses).where(inArray(shippingAddresses.orderId, pageIds)),
        db.select({
          orderId:       couponUsages.orderId,
          code:          coupons.code,
          discountType:  coupons.discountType,
          discountValue: coupons.discountValue,
        })
          .from(couponUsages)
          .leftJoin(coupons, eq(couponUsages.couponId, coupons.id))
          .where(inArray(couponUsages.orderId, pageIds)),
      ]);

      for (const item of itemRows) {
        if (!itemMap.has(item.orderId)) itemMap.set(item.orderId, []);
        itemMap.get(item.orderId)!.push(item);
      }
      for (const addr of addressRows) addressMap.set(addr.orderId, addr);
      for (const cu of couponRows) {
        couponMap.set(cu.orderId, { coupon: { code: cu.code, discountType: cu.discountType, discountValue: cu.discountValue } });
      }
    }

    const data = page.map((o) => serializeOrder({
      ...o,
      items:           itemMap.get(o.id) ?? [],
      shippingAddress: addressMap.get(o.id) ?? null,
      couponUsage:     couponMap.get(o.id) ?? null,
    }));

    const result = { data, nextCursor, total };
    const ttl    = admin ? ORDERS_ADMIN_TTL : ORDERS_USER_TTL;
    const tags   = admin
      ? [CacheTags.orders]
      : [CacheTags.orders, CacheTags.ordersByUser(userId!)];

    await cacheSet(cacheKey, result, tags, ttl);

    return NextResponse.json(result);
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[GET /api/orders]', err);
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}
