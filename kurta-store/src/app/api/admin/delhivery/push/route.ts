/**
 * POST /api/admin/delhivery/push — manual retry for orders that auto-push
 * to Delhivery missed (paid but no delhiveryOrderId yet).
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db/index';
import { orders } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { isAuthorized } from '@/lib/api-auth';
import { isDelhiveryConfigured, pushOrderToDelhivery } from '@/lib/delhivery';

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

    if (!isDelhiveryConfigured()) {
      return NextResponse.json({ error: 'Delhivery is not configured' }, { status: 409 });
    }

    await pushOrderToDelhivery(parsed.data.orderId);

    const [order] = await db.select({
      delhiveryOrderId: orders.delhiveryOrderId,
      delhiveryShipmentId: orders.delhiveryShipmentId,
      delhiveryPushError: orders.delhiveryPushError,
    }).from(orders).where(eq(orders.id, parsed.data.orderId)).limit(1);

    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    if (order.delhiveryPushError) {
      return NextResponse.json({ error: order.delhiveryPushError }, { status: 502 });
    }

    return NextResponse.json({
      delhiveryOrderId: order.delhiveryOrderId,
      delhiveryShipmentId: order.delhiveryShipmentId,
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[POST /api/admin/delhivery/push]', err);
    return NextResponse.json({ error: 'Failed to push order to Delhivery' }, { status: 500 });
  }
}
