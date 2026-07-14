/**
 * POST /api/admin/shiprocket/push — manual retry for orders that auto-push
 * to Shiprocket missed (paid but no shiprocketOrderId yet).
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db/index';
import { orders } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { isAuthorized } from '@/lib/api-auth';
import { isShiprocketConfigured, pushOrderToShiprocket } from '@/lib/shiprocket';

const PushSchema = z.object({ orderId: z.string().uuid() });

export async function POST(request: NextRequest) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body   = await request.json();
    const parsed = PushSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (!isShiprocketConfigured()) {
      return NextResponse.json({ error: 'Shiprocket is not configured' }, { status: 409 });
    }

    await pushOrderToShiprocket(parsed.data.orderId);

    const [order] = await db.select({
      shiprocketOrderId: orders.shiprocketOrderId,
      shiprocketShipmentId: orders.shiprocketShipmentId,
      shiprocketPushError: orders.shiprocketPushError,
    }).from(orders).where(eq(orders.id, parsed.data.orderId)).limit(1);

    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    if (order.shiprocketPushError) {
      return NextResponse.json({ error: order.shiprocketPushError }, { status: 502 });
    }

    return NextResponse.json({
      shiprocketOrderId: order.shiprocketOrderId,
      shiprocketShipmentId: order.shiprocketShipmentId,
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[POST /api/admin/shiprocket/push]', err);
    return NextResponse.json({ error: 'Failed to push order to Shiprocket' }, { status: 500 });
  }
}
