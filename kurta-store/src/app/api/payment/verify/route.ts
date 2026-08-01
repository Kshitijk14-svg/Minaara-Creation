import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { sendEmail, renderOrderConfirmationEmail } from '@/lib/email';
import { createOrder, CreateOrderSchema, mapOrderError, OrderError } from '@/lib/orders';
import { pushOrderToDelhivery } from '@/lib/delhivery';
import { getSessionUserId } from '@/lib/api-auth';
import { signOrderAccessToken } from '@/lib/order-access-token';
import { COD_ADVANCE_INR } from '@/lib/payment-constants';
import type { Order } from '@/types/schema';
import { invalidateTags, CacheTags } from '@/lib/cache';
import { db } from '@/db/index';
import { orders, failedRefunds } from '@/db/schema';
import { eq } from 'drizzle-orm';

const VerifySchema = z.object({
  razorpay_order_id:   z.string(),
  razorpay_payment_id: z.string(),
  razorpay_signature:  z.string(),
  orderPayload:        CreateOrderSchema,
});

export async function POST(request: NextRequest) {
  try {
    const body   = await request.json();
    const parsed = VerifySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 });
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderPayload } = parsed.data;

    // 1. Verify HMAC-SHA256 signature (proves Razorpay captured this payment).
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    const sigOk =
      expectedSignature.length === razorpay_signature.length &&
      crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(razorpay_signature));

    if (!sigOk) {
      return NextResponse.json({ error: 'Payment signature verification failed' }, { status: 400 });
    }

    // 2. Fetch the gateway order to learn the amount actually authorized and to
    //    confirm it is paid. This binds the recorded order to real money and
    //    prevents item/price tampering in orderPayload.
    const Razorpay = (await import('razorpay')).default;
    const razorpay = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });

    const rzpOrder = await razorpay.orders.fetch(razorpay_order_id);
    if (rzpOrder.status !== 'paid') {
      return NextResponse.json({ error: 'Payment not captured' }, { status: 400 });
    }
    const expectedAmountPaise = Number(rzpOrder.amount);
    // Read the shipping charge (and payment method) back from Razorpay's own
    // record (set at create-razorpay-order time) rather than trusting the
    // client or re-deriving them, which could disagree by now.
    const shippingINR   = Number(rzpOrder.notes?.shippingINR ?? 0);
    const paymentMethod = rzpOrder.notes?.paymentMethod === 'COD' ? 'COD' : 'RAZORPAY';
    const codAdvanceINR = paymentMethod === 'COD'
      ? Number(rzpOrder.notes?.codAdvanceINR ?? COD_ADVANCE_INR)
      : undefined;

    // 3. Create the order in-process. createOrder recomputes the total from DB
    //    prices and rejects unless it matches expectedAmountPaise; the gateway
    //    payment id gives replay/idempotency protection.
    const userId = (await getSessionUserId()) ?? undefined;

    let order;
    try {
      order = await createOrder(orderPayload, {
        userId,
        paymentStatus:       paymentMethod === 'COD' ? 'COD_PENDING' : 'PAID',
        paymentGatewayId:    razorpay_payment_id,
        paymentMethod,
        expectedAmountPaise,
        shippingINR,
        codAdvanceINR,
        razorpayOrderId:     razorpay_order_id,
      });
    } catch (err) {
      // Double-submit of the same verified payment: the order already exists —
      // return it as success so the client lands on the confirmation page.
      if (err instanceof OrderError && err.code === 'DUPLICATE_PAYMENT') {
        const [existing] = await db
          .select({ id: orders.id, orderNumber: orders.orderNumber })
          .from(orders)
          .where(eq(orders.paymentGatewayId, razorpay_payment_id))
          .limit(1);
        if (existing) {
          return NextResponse.json({
            success: true,
            orderId: existing.id,
            orderNumber: existing.orderNumber,
            orderAccessToken: signOrderAccessToken(existing.id),
          });
        }
      }

      // Any other business-rule rejection means Razorpay already captured this
      // payment but no order could be recorded (e.g. a stock reservation
      // expired mid-payment). There's no order to attach the charge to, so
      // refund it automatically rather than leaving the customer charged with
      // nothing to show for it.
      if (err instanceof OrderError) {
        try {
          const refund = await razorpay.payments.refund(razorpay_payment_id, {
            amount: expectedAmountPaise,
            speed:  'normal',
            notes:  { reason: err.code },
          });
          console.error('[verify] REFUND_ISSUED', {
            paymentId: razorpay_payment_id,
            orderErrorCode: err.code,
            refundId: refund.id,
          });
          const mapped = mapOrderError(err)!;
          return NextResponse.json(
            { error: `${mapped.message} — your payment has been refunded and will reflect in 5-7 business days.` },
            { status: mapped.status },
          );
        } catch (refundErr) {
          console.error('[verify] REFUND_FAILED — needs manual refund', {
            paymentId: razorpay_payment_id,
            orderErrorCode: err.code,
          }, refundErr);
          await db.insert(failedRefunds).values({
            paymentId:      razorpay_payment_id,
            orderErrorCode: err.code,
            amountPaise:    expectedAmountPaise,
          }).catch((insertErr) => {
            console.error('[verify] failed to record failed_refunds row', insertErr);
          });
          return NextResponse.json(
            { error: `Payment was charged but could not be completed, and the automatic refund failed. Please contact support with your payment ID: ${razorpay_payment_id}` },
            { status: 500 },
          );
        }
      }

      throw err;
    }

    const tags: string[] = [CacheTags.orders];
    if (order.userId) tags.push(CacheTags.ordersByUser(order.userId));
    await invalidateTags(tags);

    const orderAccessToken = signOrderAccessToken(order.id);

    // 4. Confirmation email — non-blocking.
    sendEmail({
      to:      order.customerEmail,
      subject: `Order Confirmed — ${order.orderNumber} | Minara Creation`,
      html:    renderOrderConfirmationEmail(order as unknown as Order, orderAccessToken),
    }).catch((emailErr) => {
      console.error('[verify] confirmation email failed:', emailErr);
    });

    // 5. Push to Delhivery — non-blocking (pushOrderToDelhivery records its own
    //    failures on the order row; this outer .catch() is a last-resort net).
    pushOrderToDelhivery(order.id).catch((err) => {
      console.error('[verify] delhivery push failed:', err);
    });

    return NextResponse.json({ success: true, orderId: order.id, orderNumber: order.orderNumber, orderAccessToken });
  } catch (err) {
    const mapped = mapOrderError(err);
    if (mapped) {
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }
    console.error('[POST /api/payment/verify]', err);
    return NextResponse.json({ error: 'Payment verification failed' }, { status: 500 });
  }
}
