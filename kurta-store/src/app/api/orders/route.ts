/**
 * POST /api/orders  — create order with ACID transaction (stock check + decrement + coupon claim)
 * GET  /api/orders  — paginated list (admin: all, customer: own orders)
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { isAuthorized, getSession } from '@/lib/api-auth';
import {
  cacheGet,
  cacheSet,
  invalidateTags,
  CacheKeys,
  CacheTags,
} from '@/lib/cache';

const ORDERS_ADMIN_TTL = 60;  // 1 min — admin lists are real-time sensitive
const ORDERS_USER_TTL  = 120; // 2 min — user order lists

// ── Zod schemas ──────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateOrderNumber(): string {
  const date    = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random  = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `MNC-${date}-${random}`;
}

function serializeOrder(o: any) {
  const { couponUsage, ...rest } = o;
  return {
    ...rest,
    coupon: couponUsage?.coupon ?? null,
    createdAt:   o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt,
    updatedAt:   o.updatedAt instanceof Date ? o.updatedAt.toISOString() : o.updatedAt,
    cancelledAt: o.cancelledAt instanceof Date ? o.cancelledAt?.toISOString() : o.cancelledAt ?? null,
    deliveredAt: o.deliveredAt instanceof Date ? o.deliveredAt?.toISOString() : o.deliveredAt ?? null,
  };
}

// ── POST ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const userId  = (session?.user as any)?.id as string | undefined;

    const body: unknown = await request.json();
    const parsed = CreateOrderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid order data', issues: parsed.error.issues }, { status: 400 });
    }

    const { items, shippingAddress, couponCode, ...orderData } = parsed.data;

    // ── ACID Transaction ──────────────────────────────────────────────────────
    const order = await db.$transaction(async (tx) => {
      // 1. Lock variants to prevent concurrent stock decrement race conditions
      const variantIds    = items.map((i) => i.variantId);
      const productIds    = [...new Set(items.map((i) => i.productId))];

      await tx.$queryRawUnsafe(
        `SELECT id, stock FROM product_size_variants WHERE id IN (${variantIds.map(id => `'${id}'`).join(',')}) FOR UPDATE`
      );

      const variants = await tx.productSizeVariant.findMany({
        where:   { id: { in: variantIds } },
        include: { product: { select: { id: true, title: true, images: { take: 1, orderBy: { sortOrder: 'asc' } }, priceINR: true } } },
      });

      if (variants.length !== items.length) {
        throw new Error('VARIANT_NOT_FOUND: One or more product variants not found');
      }

      // 2. Check all products are active
      const activeProducts = await tx.product.findMany({
        where: { id: { in: productIds }, isActive: true, deletedAt: null },
        select: { id: true },
      });
      if (activeProducts.length !== productIds.length) {
        throw new Error('PRODUCT_INACTIVE: One or more products are not available');
      }

      // 3. Validate stock for each item (BEFORE any writes)
      const variantMap = new Map(variants.map((v) => [v.id, v]));
      for (const item of items) {
        const variant = variantMap.get(item.variantId);
        if (!variant) throw new Error(`VARIANT_NOT_FOUND: Variant ${item.variantId}`);
        if (variant.stock < item.quantity) {
          throw new Error(
            `INSUFFICIENT_STOCK: "${variant.product.title}" size ${item.size} — available: ${variant.stock}, requested: ${item.quantity}`,
          );
        }
      }

      // 4. Validate coupon if provided
      let coupon = null;
      let discountAmountINR = 0;
      if (couponCode) {
        if (!userId) throw new Error('COUPON_REQUIRES_LOGIN: Must be logged in to use a coupon');

        const cleanCode = couponCode.toUpperCase().trim();
        // Lock the coupon row to prevent concurrent coupon usage race conditions
        await tx.$queryRawUnsafe(
          `SELECT id, usedCount FROM coupons WHERE code = '${cleanCode}' FOR UPDATE`
        );

        coupon = await tx.coupon.findUnique({
          where: { code: cleanCode },
          include: { orders: { where: { userId } } },
        });

        if (!coupon)          throw new Error('COUPON_INVALID: Coupon not found');
        if (!coupon.isActive) throw new Error('COUPON_INACTIVE: Coupon is not active');
        if (coupon.expiryDate < new Date()) throw new Error('COUPON_EXPIRED: Coupon has expired');
        if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
          throw new Error('COUPON_EXHAUSTED: Coupon has reached its maximum uses');
        }
        if (coupon.orders.length >= coupon.perUserLimit) {
          throw new Error('COUPON_PER_USER_LIMIT: You have already used this coupon');
        }
      }

      // 5. Calculate totals
      const subtotalINR = items.reduce((sum, item) => {
        const variant = variantMap.get(item.variantId)!;
        return sum + variant.product.priceINR * item.quantity;
      }, 0);

      if (coupon) {
        if (subtotalINR < coupon.minOrderAmountINR) {
          throw new Error(
            `COUPON_MIN_ORDER: Minimum order amount for this coupon is ₹${coupon.minOrderAmountINR}`,
          );
        }
        if (coupon.discountType === 'PERCENT') {
          discountAmountINR = (subtotalINR * coupon.discountValue) / 100;
          if (coupon.maxDiscountINR) {
            discountAmountINR = Math.min(discountAmountINR, coupon.maxDiscountINR);
          }
        } else {
          discountAmountINR = Math.min(coupon.discountValue, subtotalINR);
        }
      }

      const totalAmountINR = subtotalINR - discountAmountINR;

      // 6. Create the order with all related data
      const newOrder = await tx.order.create({
        data: {
          orderNumber:      generateOrderNumber(),
          userId:           userId ?? null,
          customerEmail:    orderData.customerEmail,
          customerPhone:    orderData.customerPhone,
          currency:         orderData.currency,
          notes:            orderData.notes ?? null,
          discountAmountINR,
          subtotalINR,
          totalAmountINR,
          shippingAddress: {
            create: shippingAddress,
          },
          items: {
            create: items.map((item) => {
              const v = variantMap.get(item.variantId)!;
              return {
                productId: item.productId,
                variantId: item.variantId,
                title:     v.product.title,
                size:      item.size,
                imageUrl:  v.product.images[0]?.url ?? null,
                quantity:  item.quantity,
                priceINR:  v.product.priceINR,
              };
            }),
          },
        },
        include: {
          items:           true,
          shippingAddress: true,
        },
      });

      // 7. Atomically decrement stock (verifying stock constraint in the database)
      for (const item of items) {
        try {
          await tx.productSizeVariant.update({
            where: { id: item.variantId, stock: { gte: item.quantity } },
            data:  { stock: { decrement: item.quantity } },
          });
        } catch (err: any) {
          const variant = variantMap.get(item.variantId);
          throw new Error(`CONCURRENT_INSUFFICIENT_STOCK: "${variant?.product.title || 'Product'}" size ${item.size} — stock was reduced concurrently`);
        }
      }

      // 8. Record coupon usage + increment usedCount (verifying usage constraints)
      if (coupon) {
        await tx.couponUsage.create({
          data: {
            couponId: coupon.id,
            userId:   userId!,
            orderId:  newOrder.id,
          },
        });
        try {
          await tx.coupon.update({
            where: { id: coupon.id, OR: [{ maxUses: null }, { usedCount: { lt: coupon.maxUses ?? undefined } }] },
            data:  { usedCount: { increment: 1 } },
          });
        } catch (err: any) {
          throw new Error('CONCURRENT_COUPON_EXHAUSTED: Coupon has reached its maximum uses concurrently');
        }
      }

      return newOrder;
    });
    // ── End Transaction ───────────────────────────────────────────────────────

    // Invalidate order caches for this user
    const tagsToInvalidate: string[] = [CacheTags.orders];
    if (userId) tagsToInvalidate.push(CacheTags.ordersByUser(userId));
    await invalidateTags(tagsToInvalidate);

    return NextResponse.json({ orderId: order.id, orderNumber: order.orderNumber }, { status: 201 });
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

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cursor          = searchParams.get('cursor') ?? undefined;
    const limit           = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);
    const statusFilter    = searchParams.get('status') ?? undefined;
    const paymentFilter   = searchParams.get('paymentStatus') ?? undefined;
    const emailFilter     = searchParams.get('email') ?? undefined;

    const session = await getSession();
    const userId  = (session?.user as any)?.id as string | undefined;
    const admin   = await isAuthorized(request);

    if (!admin && !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = new URLSearchParams({
      cursor: cursor ?? '',
      limit: String(limit),
      status: statusFilter ?? '',
      paymentStatus: paymentFilter ?? '',
      email: admin ? (emailFilter ?? '') : '',
    }).toString();

    const cacheKey = admin
      ? CacheKeys.orders.adminList(params)
      : CacheKeys.orders.userList(userId!, params);

    const cached = await cacheGet(cacheKey);
    if (cached) return NextResponse.json(cached);

    // Build where
    const where: Record<string, unknown> = {};
    if (!admin) {
      where.userId = userId; // customers only see their own orders
    } else if (emailFilter) {
      where.customerEmail = { contains: emailFilter };
    }
    if (statusFilter)  where.status = statusFilter;
    if (paymentFilter) where.paymentStatus = paymentFilter;

    const [orders, total] = await Promise.all([
      db.order.findMany({
        where,
        select: {
          id:               true,
          orderNumber:      true,
          userId:           true,
          customerEmail:    true,
          customerPhone:    true,
          status:           true,
          paymentStatus:    true,
          discountAmountINR: true,
          subtotalINR:      true,
          totalAmountINR:   true,
          currency:         true,
          createdAt:        true,
          updatedAt:        true,
          items: {
            select: {
              id: true, title: true, size: true, quantity: true, priceINR: true, imageUrl: true,
            },
          },
          shippingAddress:  true,
          couponUsage: {
            select: {
              coupon: { select: { code: true, discountType: true, discountValue: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take:    limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      db.order.count({ where }),
    ]);

    const hasMore    = orders.length > limit;
    const page       = hasMore ? orders.slice(0, limit) : orders;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    const result = {
      data:       page.map(serializeOrder),
      nextCursor,
      total,
    };

    const ttl  = admin ? ORDERS_ADMIN_TTL : ORDERS_USER_TTL;
    const tags = admin
      ? [CacheTags.orders]
      : [CacheTags.orders, CacheTags.ordersByUser(userId!)];
    await cacheSet(cacheKey, result, tags, ttl);

    return NextResponse.json(result);
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[GET /api/orders]', err);
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}
