import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db/index';
import { stockReservations } from '@/db/schema';
import { eq } from 'drizzle-orm';

const RequestSchema = z.object({
  razorpayOrderId: z.string().min(1),
});

/**
 * Best-effort early release of a checkout's stock hold (e.g. the customer
 * closed the Razorpay modal without paying). Not required for correctness —
 * the reservation's TTL (see create-razorpay-order) is the real backstop —
 * this just frees the unit up sooner than the TTL would.
 */
export async function POST(request: NextRequest) {
  try {
    const body   = await request.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    await db.delete(stockReservations).where(eq(stockReservations.razorpayOrderId, parsed.data.razorpayOrderId));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/payment/release-reservation]', err);
    return NextResponse.json({ error: 'Failed to release reservation' }, { status: 500 });
  }
}
