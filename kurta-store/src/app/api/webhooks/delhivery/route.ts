/**
 * POST /api/webhooks/delhivery — inbound status-update webhook from Delhivery.
 *
 * This mirrors the app's first inbound webhook (formerly Shiprocket's): no
 * session, no internal-key — an open-internet caller — so it's verified with
 * a constant-time shared-secret header compare rather than session/role auth.
 *
 * ⚠️ Delhivery's self-serve seller accounts don't always offer a configurable
 * push webhook the way Shiprocket does (often enterprise-only). This route is
 * built defensively in case the account does have it; the polling cron
 * (/api/cron/delhivery-sync) is the guaranteed-to-work fallback either way.
 * The field names read from `body` below are placeholders — confirm the real
 * payload shape once webhook access is confirmed/registered.
 *
 * Always returns 200 for anything past the auth check so Delhivery doesn't
 * retry-storm a delivery it considers successful.
 */
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/api-auth';
import { applyIncomingStatusUpdate } from '@/lib/delhivery';

export async function POST(request: NextRequest) {
  const headerName = process.env.DELHIVERY_WEBHOOK_HEADER_NAME || 'x-api-key';
  const receivedToken = request.headers.get(headerName);

  if (!safeEqual(receivedToken, process.env.DELHIVERY_WEBHOOK_TOKEN)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    // Malformed payload Delhivery will never resend correctly — ack it away.
    return NextResponse.json({ received: true }, { status: 200 });
  }

  try {
    // ⚠️ UNVERIFIED field names — placeholders pending a real Delhivery webhook payload.
    const rawStatus = body.Status?.Status || body.status || body.current_status;
    if (!rawStatus) {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const awb = body.Waybill || body.waybill || body.awb;
    await applyIncomingStatusUpdate({
      delhiveryOrderId: awb ? String(awb) : null,
      orderNumber: body.order_id || body.ReferenceNo ? String(body.order_id || body.ReferenceNo) : null,
      rawStatus: String(rawStatus),
      awb: awb ? String(awb) : null,
      courierName: 'Delhivery',
      trackingUrl: awb ? `https://www.delhivery.com/track/package/${awb}` : null,
    });
  } catch (err) {
    console.error('[webhooks/delhivery] failed to process update:', err);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
