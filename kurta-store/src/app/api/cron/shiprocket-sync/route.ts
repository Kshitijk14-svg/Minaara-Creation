/**
 * GET /api/cron/shiprocket-sync — polling fallback for Shiprocket status updates.
 *
 * The webhook (src/app/api/webhooks/shiprocket/route.ts) is the primary path;
 * this cron exists in case a webhook delivery is missed. Requires a VPS
 * crontab entry to actually run (see OVH-deploy.md) — this repo has no
 * scheduler of its own.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { orders } from '@/db/schema';
import { and, isNotNull, notInArray, eq } from 'drizzle-orm';
import { isShiprocketConfigured, trackShipmentByAwb, applyIncomingStatusUpdate } from '@/lib/shiprocket';
import type { OrderStatus } from '@/types/schema';

const TERMINAL_STATUSES: OrderStatus[] = ['DELIVERED', 'CANCELLED', 'REFUNDED', 'RTO_DELIVERED'];
const BATCH_LIMIT = 100;

export async function GET(request: NextRequest) {
  try {
    const authHeader    = request.headers.get('Authorization');
    const expectedToken = `Bearer ${process.env.CRON_SECRET}`;
    if (!authHeader || authHeader !== expectedToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isShiprocketConfigured()) {
      return NextResponse.json({ skipped: true, reason: 'Shiprocket not configured' });
    }

    const inFlight = await db.select({ id: orders.id, orderNumber: orders.orderNumber, awbNumber: orders.awbNumber })
      .from(orders)
      .where(and(
        eq(orders.paymentStatus, 'PAID'),
        notInArray(orders.status, TERMINAL_STATUSES),
        isNotNull(orders.shiprocketOrderId),
        isNotNull(orders.awbNumber),
      ))
      .limit(BATCH_LIMIT);

    let updated = 0;
    for (const order of inFlight) {
      if (!order.awbNumber) continue;
      const result = await trackShipmentByAwb(order.awbNumber);
      if (!result) continue;
      await applyIncomingStatusUpdate({
        shiprocketOrderId: null,
        orderNumber: order.orderNumber,
        rawStatus: result.rawStatus,
        awb: order.awbNumber,
        courierName: result.courierName,
        trackingUrl: result.trackingUrl,
      });
      updated++;
    }

    return NextResponse.json({ checked: inFlight.length, updated });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[GET /api/cron/shiprocket-sync]', err);
    }
    return NextResponse.json({ error: 'Failed to run shiprocket sync' }, { status: 500 });
  }
}
