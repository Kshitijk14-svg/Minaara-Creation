/**
 * POST /api/orders  — create order (internal server-to-server only; see createOrder)
 * GET  /api/orders  — paginated list (admin: all, customer: own orders)
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import {
  orders, orderItems, shippingAddresses, coupons, couponUsages,
} from '@/db/schema';
import { isAuthorized, getSession, isInternalRequest } from '@/lib/api-auth';
import { cacheGet, cacheSet, invalidateTags, CacheKeys, CacheTags } from '@/lib/cache';
import { getOrdersAdminList } from '@/lib/admin-list-queries';
import { and, count, desc, eq, inArray, lt } from 'drizzle-orm';
import { createOrder, CreateOrderSchema, mapOrderError, type CreateOrderOptions } from '@/lib/orders';

const ORDERS_USER_TTL = 120;

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
  // Order creation is a trusted server-to-server operation (invoked after a
  // verified payment). It must never be reachable directly from a browser.
  if (!isInternalRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body   = await request.json();
    const parsed = CreateOrderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid order data', issues: parsed.error.issues }, { status: 400 });
    }

    // Payment metadata + userId come from the trusted caller, not the customer.
    const opts: CreateOrderOptions = {
      userId:              typeof body.userId === 'string' ? body.userId : null,
      paymentStatus:       body.paymentStatus,
      paymentGatewayId:    body.paymentGatewayId ?? null,
      paymentMethod:       body.paymentMethod ?? null,
      expectedAmountPaise: typeof body.expectedAmountPaise === 'number' ? body.expectedAmountPaise : undefined,
    };

    const order = await createOrder(parsed.data, opts);

    const tagsToInvalidate: string[] = [CacheTags.orders];
    if (order.userId) tagsToInvalidate.push(CacheTags.ordersByUser(order.userId));
    await invalidateTags(tagsToInvalidate);

    return NextResponse.json({ order, orderId: order.id, orderNumber: order.orderNumber }, { status: 201 });
  } catch (err) {
    const mapped = mapOrderError(err);
    if (mapped) return NextResponse.json({ error: mapped.message }, { status: mapped.status });
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

    if (admin) {
      const result = await getOrdersAdminList({
        cursor, limit, status: statusFilter, paymentStatus: paymentFilter, email: emailFilter,
      });
      return NextResponse.json(result);
    }

    const params = new URLSearchParams({
      cursor: cursor ?? '', limit: String(limit),
      status: statusFilter ?? '', paymentStatus: paymentFilter ?? '',
      email: '',
    }).toString();

    const cacheKey = CacheKeys.orders.userList(userId!, params);

    const cached = await cacheGet(cacheKey);
    if (cached) return NextResponse.json(cached);

    // Resolve cursor
    let cursorDate: Date | undefined;
    if (cursor) {
      const [ci] = await db.select({ createdAt: orders.createdAt }).from(orders).where(eq(orders.id, cursor)).limit(1);
      cursorDate = ci?.createdAt;
    }

    const conditions = and(
      eq(orders.userId, userId!),
      statusFilter  ? eq(orders.status,        statusFilter  as any) : undefined,
      paymentFilter ? eq(orders.paymentStatus, paymentFilter as any) : undefined,
      cursorDate    ? lt(orders.createdAt,     cursorDate)           : undefined,
    );

    const countConditions = and(
      eq(orders.userId, userId!),
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
    await cacheSet(cacheKey, result, [CacheTags.orders, CacheTags.ordersByUser(userId!)], ORDERS_USER_TTL);

    return NextResponse.json(result);
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[GET /api/orders]', err);
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}
