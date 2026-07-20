/**
 * POST /api/shipping/rate — public shipping quote for the checkout page.
 * Read-only: computes a delivery charge from the destination pincode + cart
 * items so the price shown while typing matches what will actually be
 * charged (see getShippingRateINR / create-razorpay-order).
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db/index';
import { products } from '@/db/schema';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { getItemsWeightGrams, getShippingRateINR } from '@/lib/delhivery';

const RequestSchema = z.object({
  pincode: z.string().min(4).max(10),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity:  z.number().int().positive(),
  })).min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body   = await request.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
    }

    const { pincode, items } = parsed.data;
    const productIds = [...new Set(items.map((i) => i.productId))];

    const dbProducts = await db.select({ id: products.id, priceINR: products.priceINR, weightGrams: products.weightGrams })
      .from(products)
      .where(and(inArray(products.id, productIds), eq(products.isActive, true), isNull(products.deletedAt)));

    if (dbProducts.length !== productIds.length) {
      return NextResponse.json({ error: 'One or more products are not available' }, { status: 409 });
    }

    const priceMap = new Map(dbProducts.map((p) => [p.id, p.priceINR]));
    const subtotalINR = items.reduce((sum, item) => sum + (priceMap.get(item.productId) ?? 0) * item.quantity, 0);
    const weightGrams  = await getItemsWeightGrams(items);

    const { shippingINR } = await getShippingRateINR({ pincode, subtotalINR, weightGrams });

    return NextResponse.json({ shippingINR });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[POST /api/shipping/rate]', err);
    return NextResponse.json({ error: 'Failed to calculate shipping' }, { status: 500 });
  }
}
