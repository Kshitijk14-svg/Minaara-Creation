import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { sendEmail, renderOrderConfirmationEmail } from '@/lib/email';

const VerifySchema = z.object({
  razorpay_order_id:   z.string(),
  razorpay_payment_id: z.string(),
  razorpay_signature:  z.string(),
  orderPayload: z.object({
    customerEmail:   z.string().email(),
    customerPhone:   z.string(),
    shippingAddress: z.object({
      fullName: z.string(),
      line1:    z.string(),
      line2:    z.string().optional(),
      city:     z.string(),
      state:    z.string(),
      pincode:  z.string(),
      country:  z.string().default('India'),
    }),
    items: z.array(z.object({
      productId: z.string(),
      variantId: z.string(),
      size:      z.enum(['XS', 'S', 'M', 'L', 'XL', 'XXL']),
      quantity:  z.number().int().positive(),
    })),
    couponCode: z.string().optional(),
    currency:   z.enum(['INR', 'USD', 'EUR']).default('INR'),
    notes:      z.string().optional(),
  }),
});

export async function POST(request: NextRequest) {
  try {
    const body   = await request.json();
    const parsed = VerifySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 });
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderPayload } = parsed.data;

    // Verify HMAC-SHA256 signature
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return NextResponse.json({ error: 'Payment signature verification failed' }, { status: 400 });
    }

    // Create the DB order
    const orderRes = await fetch(`${process.env.NEXTAUTH_URL ?? 'http://localhost:3002'}/api/orders`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': process.env.INTERNAL_API_KEY ?? '',
      },
      body: JSON.stringify({
        ...orderPayload,
        paymentGatewayId: razorpay_payment_id,
        paymentMethod:    'RAZORPAY',
        paymentStatus:    'PAID',
      }),
    });

    if (!orderRes.ok) {
      const err = await orderRes.json().catch(() => ({ error: 'Unknown error' }));
      if (process.env.NODE_ENV !== 'production') console.error('[verify] order creation failed:', err);
      return NextResponse.json(
        { error: err.error ?? 'Failed to record order after payment', razorpay_payment_id },
        { status: 502 }
      );
    }

    const { order } = await orderRes.json();

    // Send order confirmation email (non-blocking — don't fail the response if email fails)
    sendEmail({
      to:      order.customerEmail,
      subject: `Order Confirmed — ${order.orderNumber} | Minaara Creation`,
      html:    renderOrderConfirmationEmail(order),
    }).catch((err) => {
      console.error('[verify] confirmation email failed:', err);
    });

    return NextResponse.json({ success: true, orderId: order.id, orderNumber: order.orderNumber });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[POST /api/payment/verify]', err);
    return NextResponse.json({ error: 'Payment verification failed' }, { status: 500 });
  }
}
