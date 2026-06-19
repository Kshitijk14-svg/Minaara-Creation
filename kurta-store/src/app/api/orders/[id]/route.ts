/**
 * GET    /api/orders/[id]  — single order (admin or order owner)
 * PATCH  /api/orders/[id]  — update status/paymentStatus (admin)
 * DELETE /api/orders/[id]  — cancel order (admin), sets status=CANCELLED
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

const ORDER_TTL = 300; // 5 min

const UpdateOrderSchema = z.object({
  status:        z.enum(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']).optional(),
  paymentStatus: z.enum(['PENDING', 'PAID', 'FAILED', 'REFUNDED']).optional(),
  paymentGatewayId: z.string().optional(),
  paymentMethod:    z.string().optional(),
  notes:            z.string().optional(),
}).refine((d) => d.status || d.paymentStatus || d.paymentGatewayId || d.paymentMethod || d.notes, {
  message: 'At least one field must be provided',
});

const ORDER_INCLUDE = {
  items:           true,
  shippingAddress: true,
  couponUsage: {
    select: {
      coupon: { select: { code: true, discountType: true, discountValue: true } },
    },
  },
  user:   { select: { id: true, email: true, name: true } },
} as const;

function serializeOrder(o: any) {
  const { couponUsage, ...rest } = o;
  return {
    ...rest,
    coupon: couponUsage?.coupon ?? null,
    createdAt:   o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt,
    updatedAt:   o.updatedAt instanceof Date ? o.updatedAt.toISOString() : o.updatedAt,
    cancelledAt: o.cancelledAt ? (o.cancelledAt instanceof Date ? o.cancelledAt.toISOString() : o.cancelledAt) : null,
    deliveredAt: o.deliveredAt ? (o.deliveredAt instanceof Date ? o.deliveredAt.toISOString() : o.deliveredAt) : null,
  };
}

// ── GET ──────────────────────────────────────────────────────────────────────

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
      // For non-admin users, ensure cached order belongs to them
      if (!admin && (cached as any).userId !== userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.json({ order: cached });
    }

    const order = await db.order.findUnique({
      where:   { id },
      include: ORDER_INCLUDE,
    });

    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    // Ownership check for non-admins
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

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body: unknown = await request.json();
    const parsed = UpdateOrderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', issues: parsed.error.issues }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };

    // Set timestamp fields automatically
    if (parsed.data.status === 'DELIVERED')  updateData.deliveredAt = new Date();
    if (parsed.data.status === 'CANCELLED')  updateData.cancelledAt = new Date();

    const updated = await db.order.update({
      where:   { id },
      data:    updateData,
      include: ORDER_INCLUDE,
    });

    // Invalidate caches
    const tags = [CacheTags.orders, CacheTags.orderSingle(id)];
    if (updated.userId) tags.push(CacheTags.ordersByUser(updated.userId));
    await invalidateTags(tags);

    return NextResponse.json({ order: serializeOrder(updated) });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    if (process.env.NODE_ENV !== 'production') console.error('[PATCH /api/orders/[id]]', err);
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
  }
}

// ── DELETE (cancel) ───────────────────────────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const order = await db.order.findUnique({
      where: { id },
      include: { couponUsage: true },
    });
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    if (order.status === 'DELIVERED') {
      return NextResponse.json({ error: 'Cannot cancel a delivered order' }, { status: 409 });
    }

    // Cancel order — restore stock inside a transaction
    await db.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data:  { status: 'CANCELLED', cancelledAt: new Date(), updatedAt: new Date() },
      });

      // Restore stock for each item
      const items = await tx.orderItem.findMany({ where: { orderId: id } });
      for (const item of items) {
        if (item.variantId) {
          await tx.productSizeVariant.update({
            where: { id: item.variantId },
            data:  { stock: { increment: item.quantity } },
          });
        }
      }

      // Free up the coupon usage slot
      if (order.couponUsage) {
        await tx.couponUsage.delete({ where: { id: order.couponUsage.id } });
        await tx.coupon.update({
          where: { id: order.couponUsage.couponId },
          data:  { usedCount: { decrement: 1 } },
        });
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
