import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUserId } from '@/lib/api-auth';

/**
 * Razorpay rejects orders below ₹1. Guard before the SDK call so a free/near-free
 * cart produces a clear message instead of an opaque gateway error.
 */
const MIN_CHARGEABLE_PAISE = 100;

/**
 * Turns an unexpected throw into a machine-readable code + a log line carrying the
 * fields that actually identify the fault. The customer still sees a generic
 * message — nothing here (keys, SQL, gateway internals) reaches the response body.
 */
function classifyError(err: unknown): 'GATEWAY_ERROR' | 'DB_ERROR' | 'UNKNOWN' {
  const e = err as any;
  if (e?.statusCode || e?.error?.description) return 'GATEWAY_ERROR';
  if (typeof e?.code === 'string' && (e.code.startsWith('ER_') || e.code.startsWith('PROTOCOL_') || e.code === 'ECONNREFUSED')) return 'DB_ERROR';
  return 'UNKNOWN';
}

const ItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid(),
  size:      z.enum(['XS', 'S', 'M', 'L', 'XL', 'XXL']),
  quantity:  z.number().int().positive(),
  priceINR:  z.number().positive(),
});

const RequestSchema = z.object({
  items:      z.array(ItemSchema).min(1),
  couponCode: z.string().optional(),
  pincode:    z.string().min(4).max(10),
});

export async function POST(request: NextRequest) {
  try {
    // Preflight: a missing key would otherwise surface as an opaque "key_id is
    // mandatory" throw from the SDK, indistinguishable from any other 500.
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      console.error('[create-razorpay-order] RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET not configured');
      return NextResponse.json(
        { error: 'Payment gateway is not configured', code: 'GATEWAY_NOT_CONFIGURED' },
        { status: 503 },
      );
    }

    const body   = await request.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
    }

    const { items, couponCode, pincode } = parsed.data;

    // Server-side price verification against DB
    const { db } = await import('@/db/index');
    const { products, productSizeVariants, coupons, couponUsages } = await import('@/db/schema');
    const { and, count, eq, inArray, isNull } = await import('drizzle-orm');

    const productIds = [...new Set(items.map((i) => i.productId))];
    const variantIds = items.map((i) => i.variantId);

    const [dbProducts, dbVariants] = await Promise.all([
      db.select({ id: products.id, priceINR: products.priceINR, isActive: products.isActive })
        .from(products)
        .where(and(inArray(products.id, productIds), eq(products.isActive, true), isNull(products.deletedAt))),
      db.select({ id: productSizeVariants.id, stock: productSizeVariants.stock })
        .from(productSizeVariants)
        .where(inArray(productSizeVariants.id, variantIds)),
    ]);

    if (dbProducts.length !== productIds.length) {
      return NextResponse.json({ error: 'One or more products are not available' }, { status: 409 });
    }

    const productMap = new Map(dbProducts.map((p) => [p.id, p]));
    const variantMap = new Map(dbVariants.map((v) => [v.id, v]));

    // Validate stock + compute verified subtotal
    let subtotalINR = 0;
    for (const item of items) {
      const v = variantMap.get(item.variantId);
      if (!v) return NextResponse.json({ error: `Variant not found: ${item.variantId}` }, { status: 409 });
      if (v.stock < item.quantity) return NextResponse.json({ error: `Insufficient stock for size ${item.size}` }, { status: 409 });
      const p = productMap.get(item.productId);
      if (!p) return NextResponse.json({ error: `Product not found: ${item.productId}` }, { status: 409 });
      subtotalINR += p.priceINR * item.quantity;
    }

    // Apply coupon discount if provided.
    // Every rule createOrder enforces (src/lib/orders.ts) must be enforced here too:
    // anything this route lets through but createOrder later rejects means the
    // customer is charged for an order that can never be recorded. So these are
    // hard rejections, not a silent fall back to a zero discount.
    let discountINR = 0;
    if (couponCode) {
      const userId = await getSessionUserId();
      if (!userId) {
        return NextResponse.json({ error: 'Sign in to use a coupon' }, { status: 422 });
      }

      const cleanCode = couponCode.toUpperCase().trim();
      const [coupon] = await db.select().from(coupons).where(eq(coupons.code, cleanCode)).limit(1);

      if (!coupon)          return NextResponse.json({ error: 'Coupon not found' }, { status: 422 });
      if (!coupon.isActive) return NextResponse.json({ error: 'Coupon is not active' }, { status: 422 });
      if (coupon.expiryDate < new Date()) return NextResponse.json({ error: 'Coupon has expired' }, { status: 422 });
      if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
        return NextResponse.json({ error: 'Coupon has reached its maximum uses' }, { status: 422 });
      }
      if (subtotalINR < coupon.minOrderAmountINR) {
        return NextResponse.json({ error: `Minimum order amount for this coupon is ₹${coupon.minOrderAmountINR}` }, { status: 422 });
      }

      const [{ perUserUsage }] = await db
        .select({ perUserUsage: count() })
        .from(couponUsages)
        .where(and(eq(couponUsages.couponId, coupon.id), eq(couponUsages.userId, userId)));

      if (perUserUsage >= coupon.perUserLimit) {
        return NextResponse.json({ error: 'You have already used this coupon' }, { status: 422 });
      }

      discountINR = coupon.discountType === 'PERCENT'
        ? Math.min(subtotalINR * (coupon.discountValue / 100), coupon.maxDiscountINR ?? Infinity)
        : Math.min(coupon.discountValue, subtotalINR);
    }

    const { getItemsWeightGrams, getShippingRateINR } = await import('@/lib/delhivery');
    const weightGrams = await getItemsWeightGrams(items);
    const { shippingINR } = await getShippingRateINR({ pincode, subtotalINR, weightGrams });
    const totalINR    = Math.max(0, subtotalINR - discountINR + shippingINR);

    const amountPaise = Math.round(totalINR * 100);
    if (amountPaise < MIN_CHARGEABLE_PAISE) {
      return NextResponse.json({ error: 'Order total must be at least ₹1 to pay online' }, { status: 422 });
    }

    // Create Razorpay order
    const Razorpay = (await import('razorpay')).default;
    const razorpay = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });

    const rzpOrder = await razorpay.orders.create({
      amount:   amountPaise,
      currency: 'INR',
      receipt:  `rcpt_${Date.now()}`,
      // Locks the shipping charge to this Razorpay order so /api/payment/verify
      // can read it back from Razorpay's own record instead of trusting the
      // client or re-querying Delhivery (which could return a different rate).
      notes: { shippingINR: String(shippingINR) },
    });

    return NextResponse.json({
      razorpayOrderId: rzpOrder.id,
      amount:          rzpOrder.amount,
      currency:        rzpOrder.currency,
      keyId:           process.env.RAZORPAY_KEY_ID,
      subtotalINR,
      discountINR,
      shippingINR,
      totalINR,
    });
  } catch (err) {
    const code = classifyError(err);
    const e    = err as any;
    console.error('[POST /api/payment/create-razorpay-order]', code, {
      // Razorpay SDK errors
      gatewayStatus:      e?.statusCode,
      gatewayDescription: e?.error?.description,
      gatewayReason:      e?.error?.reason,
      // mysql2 errors
      dbCode:       e?.code,
      dbSqlMessage: e?.sqlMessage,
    }, err);
    return NextResponse.json({ error: 'Failed to create payment order', code }, { status: 500 });
  }
}
