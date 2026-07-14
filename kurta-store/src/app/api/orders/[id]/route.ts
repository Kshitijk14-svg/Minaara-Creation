/**
 * GET    /api/orders/[id]  — single order (admin or order owner)
 * PATCH  /api/orders/[id]  — update status/paymentStatus (admin)
 * DELETE /api/orders/[id]  — cancel order (admin), sets status=CANCELLED
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db/index';
import {
  orders, orderItems, shippingAddresses,
  productSizeVariants, coupons, couponUsages,
} from '@/db/schema';
import { isAuthorized, getSession } from '@/lib/api-auth';
import {
  cacheGet, cacheSet, invalidateTags,
  CacheKeys, CacheTags,
} from '@/lib/cache';
import { and, eq, sql } from 'drizzle-orm';

const ORDER_TTL = 300;

const UpdateOrderSchema = z.object({
  status:           z.enum(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RTO_INITIATED', 'RTO_DELIVERED', 'CANCELLED', 'REFUNDED']).optional(),
  paymentStatus:    z.enum(['PENDING', 'PAID', 'FAILED', 'REFUNDED']).optional(),
  paymentGatewayId: z.string().optional(),
  paymentMethod:    z.string().optional(),
  notes:            z.string().optional(),
}).refine((d) => d.status || d.paymentStatus || d.paymentGatewayId || d.paymentMethod || d.notes, {
  message: 'At least one field must be provided',
});

function serializeOrder(o: any) {
  const { couponUsage, ...rest } = o;
  return {
    ...rest,
    coupon:      couponUsage?.coupon ?? null,
    createdAt:   o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt,
    updatedAt:   o.updatedAt instanceof Date ? o.updatedAt.toISOString() : o.updatedAt,
    cancelledAt: o.cancelledAt ? (o.cancelledAt instanceof Date ? o.cancelledAt.toISOString() : o.cancelledAt) : null,
    deliveredAt: o.deliveredAt ? (o.deliveredAt instanceof Date ? o.deliveredAt.toISOString() : o.deliveredAt) : null,
  };
}

async function fetchOrderWithRelations(id: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return null;

  const [items, [address], [couponRow]] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, id)),
    db.select().from(shippingAddresses).where(eq(shippingAddresses.orderId, id)).limit(1),
    db.select({
      id:            couponUsages.id,
      couponId:      couponUsages.couponId,
      code:          coupons.code,
      discountType:  coupons.discountType,
      discountValue: coupons.discountValue,
    })
      .from(couponUsages)
      .leftJoin(coupons, eq(couponUsages.couponId, coupons.id))
      .where(eq(couponUsages.orderId, id))
      .limit(1),
  ]);

  return {
    ...order,
    items,
    shippingAddress: address ?? null,
    couponUsage:     couponRow
      ? { id: couponRow.id, couponId: couponRow.couponId, coupon: { code: couponRow.code, discountType: couponRow.discountType, discountValue: couponRow.discountValue } }
      : null,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await getSession();
    const userId  = (session?.user as any)?.id as string | undefined;
    const admin   = await isAuthorized(request);

    if (!admin && !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cacheKey = CacheKeys.orders.single(id);
    const cached   = await cacheGet(cacheKey);
    if (cached) {
      if (!admin && (cached as any).userId !== userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.json({ order: cached });
    }

    const order = await fetchOrderWithRelations(id);
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    if (!admin && order.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const serialised = serializeOrder(order);
    await cacheSet(cacheKey, serialised, [CacheTags.orderSingle(id)], ORDER_TTL);

    return NextResponse.json({ order: serialised });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[GET /api/orders/[id]]', err);
    return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body   = await request.json();
    const parsed = UpdateOrderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', issues: parsed.error.issues }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
    if (parsed.data.status === 'DELIVERED') updateData.deliveredAt = new Date();
    if (parsed.data.status === 'CANCELLED') updateData.cancelledAt = new Date();

    const [existing] = await db.select({ id: orders.id, userId: orders.userId }).from(orders).where(eq(orders.id, id)).limit(1);
    if (!existing) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    await db.update(orders).set(updateData).where(eq(orders.id, id));

    const order = await fetchOrderWithRelations(id);

    const tags = [CacheTags.orders, CacheTags.orderSingle(id)];
    if (existing.userId) tags.push(CacheTags.ordersByUser(existing.userId));
    await invalidateTags(tags);

    return NextResponse.json({ order: serializeOrder(order!) });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[PATCH /api/orders/[id]]', err);
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    if (order.status === 'DELIVERED') {
      return NextResponse.json({ error: 'Cannot cancel a delivered order' }, { status: 409 });
    }

    await db.transaction(async (tx) => {
      await tx.update(orders)
        .set({ status: 'CANCELLED', cancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(orders.id, id));

      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
      for (const item of items) {
        if (item.variantId) {
          await tx.update(productSizeVariants)
            .set({ stock: sql`stock + ${item.quantity}`, updatedAt: new Date() })
            .where(eq(productSizeVariants.id, item.variantId));
        }
      }

      const [couponRow] = await tx.select().from(couponUsages).where(eq(couponUsages.orderId, id)).limit(1);
      if (couponRow) {
        await tx.delete(couponUsages).where(eq(couponUsages.id, couponRow.id));
        await tx.update(coupons)
          .set({ usedCount: sql`usedCount - 1`, updatedAt: new Date() })
          .where(eq(coupons.id, couponRow.couponId));
      }
    });

    const tags = [CacheTags.orders, CacheTags.orderSingle(id)];
    if (order.userId) tags.push(CacheTags.ordersByUser(order.userId));
    await invalidateTags(tags);

    return NextResponse.json({ success: true, message: 'Order cancelled and stock restored' });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[DELETE /api/orders/[id]]', err);
    return NextResponse.json({ error: 'Failed to cancel order' }, { status: 500 });
  }
}
