/**
 * GET /api/cron/delhivery-sync — polling fallback for Delhivery status updates.
 *
 * The webhook (src/app/api/webhooks/delhivery/route.ts) may or may not be
 * available depending on the client's Delhivery plan, so this cron is the
 * guaranteed-to-work path. Requires a VPS crontab entry to actually run (see
 * OVH-deploy.md) — this repo has no scheduler of its own.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { orders } from '@/db/schema';
import { and, isNotNull, notInArray, eq } from 'drizzle-orm';
import { isDelhiveryConfigured, trackShipmentByAwb, applyIncomingStatusUpdate } from '@/lib/delhivery';
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

    if (!isDelhiveryConfigured()) {
      return NextResponse.json({ skipped: true, reason: 'Delhivery not configured' });
    }

    const inFlight = await db.select({ id: orders.id, orderNumber: orders.orderNumber, awbNumber: orders.awbNumber })
      .from(orders)
      .where(and(
        eq(orders.paymentStatus, 'PAID'),
        notInArray(orders.status, TERMINAL_STATUSES),
        isNotNull(orders.delhiveryOrderId),
        isNotNull(orders.awbNumber),
      ))
      .limit(BATCH_LIMIT);

    let updated = 0;
    for (const order of inFlight) {
      if (!order.awbNumber) continue;
      const result = await trackShipmentByAwb(order.awbNumber);
      if (!result) continue;
      await applyIncomingStatusUpdate({
        delhiveryOrderId: null,
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
      console.error('[GET /api/cron/delhivery-sync]', err);
    }
    return NextResponse.json({ error: 'Failed to run delhivery sync' }, { status: 500 });
  }
}
