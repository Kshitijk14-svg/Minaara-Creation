/**
 * POST /api/coupons           — validate coupon (signed-in) OR create (admin)
 * GET  /api/coupons           — paginated list (admin)
 * PATCH /api/coupons          — update coupon (admin)
 * DELETE /api/coupons?id=...  — delete/deactivate coupon (admin)
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db/index';
import { coupons, couponUsages } from '@/db/schema';
import { isAuthorized, getSession } from '@/lib/api-auth';
import { cacheGet, cacheSet, invalidateTags, CacheKeys, CacheTags } from '@/lib/cache';
import { getCouponsList } from '@/lib/admin-list-queries';
import { and, count, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

const COUPON_TTL = 300;

const ValidateCouponSchema = z.object({
  code:        z.string().min(1).transform((s) => s.toUpperCase().trim()),
  orderAmount: z.number().positive().optional(),
});

const CreateCouponSchema = z.object({
  code:              z.string().min(1).max(50).transform((s) => s.toUpperCase().trim()),
  discountType:      z.enum(['PERCENT', 'FIXED']).default('PERCENT'),
  discountValue:     z.number().positive(),
  minOrderAmountINR: z.number().min(0).optional().default(0),
  maxDiscountINR:    z.number().positive().optional(),
  maxUses:           z.number().int().positive().optional(),
  perUserLimit:      z.number().int().positive().optional().default(1),
  expiryDate:        z.string().transform((s) => new Date(s)),
  isActive:          z.boolean().optional().default(true),
});

const UpdateCouponSchema = z.object({
  id:                z.string().uuid(),
  discountType:      z.enum(['PERCENT', 'FIXED']).optional(),
  discountValue:     z.number().positive().optional(),
  minOrderAmountINR: z.number().min(0).optional(),
  maxDiscountINR:    z.number().positive().nullable().optional(),
  maxUses:           z.number().int().positive().nullable().optional(),
  perUserLimit:      z.number().int().positive().optional(),
  expiryDate:        z.string().transform((s) => new Date(s)).optional(),
  isActive:          z.boolean().optional(),
});

function serializeCoupon(c: any) {
  return {
    ...c,
    discountPercent: c.discountType === 'PERCENT' ? c.discountValue : undefined,
    expiryDate: c.expiryDate instanceof Date ? c.expiryDate.toISOString() : c.expiryDate,
    createdAt:  c.createdAt instanceof Date  ? c.createdAt.toISOString()  : c.createdAt,
    updatedAt:  c.updatedAt instanceof Date  ? c.updatedAt.toISOString()  : c.updatedAt,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: any = await request.json();

    if (body && typeof body.discountPercent !== 'undefined') {
      body.discountType  = 'PERCENT';
      body.discountValue = body.discountPercent;
      if (typeof body.minOrderAmountINR === 'undefined') body.minOrderAmountINR = 0;
      if (typeof body.perUserLimit === 'undefined')      body.perUserLimit      = 1;
    }

    // Admin: create coupon
    if (body && typeof body.discountValue !== 'undefined') {
      if (!(await isAuthorized(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const parsed = CreateCouponSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid request body', issues: parsed.error.issues }, { status: 400 });
      }

      if (parsed.data.discountType === 'PERCENT' && parsed.data.discountValue > 100) {
        return NextResponse.json({ error: 'PERCENT discount value must be between 1 and 100' }, { status: 400 });
      }

      const id = randomUUID();
      await db.insert(coupons).values({ id, ...parsed.data });
      const [coupon] = await db.select().from(coupons).where(eq(coupons.id, id)).limit(1);
      await invalidateTags([CacheTags.coupons]);

      return NextResponse.json({ coupon: serializeCoupon(coupon) }, { status: 201 });
    }

    // Signed-in customer: validate coupon
    const parsed = ValidateCouponSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', issues: parsed.error.issues }, { status: 400 });
    }

    const { code, orderAmount } = parsed.data;

    // Coupons are per-user (perUserLimit + couponUsages), so createOrder refuses
    // one without a userId. Reject here too — otherwise a guest can "apply" a
    // coupon, get charged the discounted amount, and have order creation fail
    // after the money is captured.
    const session = await getSession();
    const userId  = (session?.user as any)?.id as string | undefined;
    if (!userId) {
      return NextResponse.json({ error: 'Sign in to use a coupon' }, { status: 401 });
    }

    const cacheKey = CacheKeys.coupons.byCode(code);
    let coupon     = await cacheGet<any>(cacheKey);

    if (!coupon) {
      const [raw] = await db
        .select({
          id:                coupons.id, code: coupons.code, discountType: coupons.discountType,
          discountValue:     coupons.discountValue, minOrderAmountINR: coupons.minOrderAmountINR,
          maxDiscountINR:    coupons.maxDiscountINR, maxUses: coupons.maxUses,
          usedCount:         coupons.usedCount, perUserLimit: coupons.perUserLimit,
          expiryDate:        coupons.expiryDate, isActive: coupons.isActive,
        })
        .from(coupons)
        .where(eq(coupons.code, code))
        .limit(1);

      if (raw) {
        coupon = serializeCoupon(raw);
        await cacheSet(cacheKey, coupon, [CacheTags.coupons], COUPON_TTL);
      }
    }

    if (!coupon)        return NextResponse.json({ error: 'Coupon not found' }, { status: 404 });
    if (!coupon.isActive) return NextResponse.json({ error: 'Coupon is not active' }, { status: 422 });
    if (new Date(coupon.expiryDate) < new Date()) return NextResponse.json({ error: 'Coupon has expired' }, { status: 422 });
    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      return NextResponse.json({ error: 'Coupon has reached its maximum uses' }, { status: 422 });
    }
    if (orderAmount !== undefined && orderAmount < coupon.minOrderAmountINR) {
      return NextResponse.json({ error: `Minimum order amount for this coupon is ₹${coupon.minOrderAmountINR}` }, { status: 422 });
    }

    const [{ usageCount }] = await db
      .select({ usageCount: count() })
      .from(couponUsages)
      .where(and(eq(couponUsages.couponId, coupon.id), eq(couponUsages.userId, userId)));

    if (usageCount >= coupon.perUserLimit) {
      return NextResponse.json({ error: 'You have already used this coupon the maximum number of times' }, { status: 422 });
    }

    let discountAmountINR: number | null = null;
    if (orderAmount !== undefined) {
      if (coupon.discountType === 'PERCENT') {
        discountAmountINR = (orderAmount * coupon.discountValue) / 100;
        if (coupon.maxDiscountINR) discountAmountINR = Math.min(discountAmountINR, coupon.maxDiscountINR);
      } else {
        discountAmountINR = Math.min(coupon.discountValue, orderAmount);
      }
    }

    return NextResponse.json({
      valid:             true,
      discountType:      coupon.discountType,
      discountValue:     coupon.discountValue,
      maxDiscountINR:    coupon.maxDiscountINR,
      minOrderAmountINR: coupon.minOrderAmountINR,
      discountAmountINR,
    });
  } catch (err: any) {
    if (err?.code === 'ER_DUP_ENTRY') return NextResponse.json({ error: 'Coupon code already exists' }, { status: 409 });
    console.error('[POST /api/coupons]', err);
    return NextResponse.json({ error: 'Failed to process coupon request' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const result = await getCouponsList({
      cursor:   searchParams.get('cursor') ?? undefined,
      limit:    Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100),
      isActive: searchParams.get('isActive'),
      search:   searchParams.get('search') ?? undefined,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[GET /api/coupons]', err);
    return NextResponse.json({ error: 'Failed to fetch coupons' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body   = await request.json();
    const parsed = UpdateCouponSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', issues: parsed.error.issues }, { status: 400 });
    }

    const { id, ...updateData } = parsed.data;

    const coupon = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(coupons).where(eq(coupons.id, id)).limit(1);
      if (!existing) return null;

      const mergedType  = updateData.discountType  ?? existing.discountType;
      const mergedValue = updateData.discountValue ?? existing.discountValue;
      if (mergedType === 'PERCENT' && mergedValue > 100) {
        throw Object.assign(new Error('PERCENT discount value must be between 1 and 100'), { code: 'INVALID_PERCENT' });
      }

      await tx.update(coupons)
        .set({ ...updateData, updatedAt: new Date() })
        .where(eq(coupons.id, id));

      const [updated] = await tx.select().from(coupons).where(eq(coupons.id, id)).limit(1);
      return updated;
    });

    if (!coupon) return NextResponse.json({ error: 'Coupon not found' }, { status: 404 });

    await invalidateTags([CacheTags.coupons]);

    return NextResponse.json({ coupon: serializeCoupon(coupon) });
  } catch (err: any) {
    if (err?.code === 'INVALID_PERCENT') return NextResponse.json({ error: err.message }, { status: 400 });
    console.error('[PATCH /api/coupons]', err);
    return NextResponse.json({ error: 'Failed to update coupon' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Coupon ID required' }, { status: 400 });

    let message: string;
    await db.transaction(async (tx) => {
      const [{ usageCount }] = await tx
        .select({ usageCount: count() })
        .from(couponUsages)
        .where(eq(couponUsages.couponId, id));

      if (usageCount > 0) {
        await tx.update(coupons).set({ isActive: false, updatedAt: new Date() }).where(eq(coupons.id, id));
        message = 'Coupon deactivated (has usage history, cannot be hard-deleted)';
      } else {
        await tx.delete(coupons).where(eq(coupons.id, id));
        message = 'Coupon deleted successfully';
      }
    });

    await invalidateTags([CacheTags.coupons]);
    return NextResponse.json({ success: true, message: message! });
  } catch (err) {
    console.error('[DELETE /api/coupons]', err);
    return NextResponse.json({ error: 'Failed to delete coupon' }, { status: 500 });
  }
}
