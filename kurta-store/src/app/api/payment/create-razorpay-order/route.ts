import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

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
    const body   = await request.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
    }

    const { items, couponCode, pincode } = parsed.data;

    // Server-side price verification against DB
    const { db } = await import('@/db/index');
    const { products, productSizeVariants, coupons } = await import('@/db/schema');
    const { and, eq, inArray, isNull } = await import('drizzle-orm');

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

    // Apply coupon discount if provided
    let discountINR = 0;
    if (couponCode) {
      const cleanCode = couponCode.toUpperCase().trim();
      const [coupon] = await db.select().from(coupons).where(eq(coupons.code, cleanCode)).limit(1);
      if (coupon && coupon.isActive && coupon.expiryDate >= new Date() && (coupon.maxUses === null || coupon.usedCount < coupon.maxUses)) {
        if (subtotalINR >= coupon.minOrderAmountINR) {
          discountINR = coupon.discountType === 'PERCENT'
            ? Math.min(subtotalINR * (coupon.discountValue / 100), coupon.maxDiscountINR ?? Infinity)
            : Math.min(coupon.discountValue, subtotalINR);
        }
      }
    }

    const { getItemsWeightGrams, getShippingRateINR } = await import('@/lib/shiprocket');
    const weightGrams = await getItemsWeightGrams(items);
    const { shippingINR } = await getShippingRateINR({ pincode, subtotalINR, weightGrams });
    const totalINR    = Math.max(0, subtotalINR - discountINR + shippingINR);

    // Create Razorpay order
    const Razorpay = (await import('razorpay')).default;
    const razorpay = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });

    const rzpOrder = await razorpay.orders.create({
      amount:   Math.round(totalINR * 100), // paise
      currency: 'INR',
      receipt:  `rcpt_${Date.now()}`,
      // Locks the shipping charge to this Razorpay order so /api/payment/verify
      // can read it back from Razorpay's own record instead of trusting the
      // client or re-querying Shiprocket (which could return a different rate).
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
    if (process.env.NODE_ENV !== 'production') console.error('[POST /api/payment/create-razorpay-order]', err);
    return NextResponse.json({ error: 'Failed to create payment order' }, { status: 500 });
  }
}
