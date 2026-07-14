/**
 * POST /api/webhooks/shiprocket — inbound status-update webhook from Shiprocket.
 *
 * This is the app's first real inbound webhook (no session, no internal-key —
 * an open-internet caller), so it's verified with a constant-time shared-secret
 * header compare rather than session/role auth.
 *
 * Always returns 200 for anything past the auth check (even "order not found")
 * so Shiprocket doesn't retry-storm a delivery it considers successful.
 */
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/api-auth';
import { applyIncomingStatusUpdate } from '@/lib/shiprocket';

export async function POST(request: NextRequest) {
  const headerName = process.env.SHIPROCKET_WEBHOOK_HEADER_NAME || 'x-api-key';
  const receivedToken = request.headers.get(headerName);

  if (!safeEqual(receivedToken, process.env.SHIPROCKET_WEBHOOK_TOKEN)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    // Malformed payload Shiprocket will never resend correctly — ack it away.
    return NextResponse.json({ received: true }, { status: 200 });
  }

  try {
    const rawStatus = body.current_status || body.status || body.shipment_status;
    if (!rawStatus) {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    await applyIncomingStatusUpdate({
      shiprocketOrderId: body.order_id ? String(body.order_id) : null,
      orderNumber: body.channel_order_id ? String(body.channel_order_id) : null,
      rawStatus: String(rawStatus),
      awb: body.awb ? String(body.awb) : null,
      courierName: body.courier_name || null,
      trackingUrl: body.tracking_url || body.track_url || null,
    });
  } catch (err) {
    console.error('[webhooks/shiprocket] failed to process update:', err);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
