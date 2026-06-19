/**
 * POST /api/coupons           — validate a coupon (public/logged-in) OR create one (admin)
 * GET  /api/coupons           — paginated list of all coupons (admin)
 * PATCH /api/coupons          — update a coupon (admin)
 * DELETE /api/coupons?id=...  — delete a coupon (admin)
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { isAuthorized, getSession } from '@/lib/api-auth';
import {
  cacheGet,
  cacheSet,
  invalidateTags,
  CacheKeys,
  CacheTags,
} from '@/lib/cache';

const COUPON_TTL      = 300; // 5 min for individual coupon validation
const COUPON_LIST_TTL = 300; // 5 min for admin list

// ── Zod schemas ──────────────────────────────────────────────────────────────

const ValidateCouponSchema = z.object({
  code:         z.string().min(1).transform((s) => s.toUpperCase().trim()),
  orderAmount:  z.number().positive().optional(), // for min order check
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

// ── POST ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body: any = await request.json();

    // Map legacy coupon payload if present
    if (body && typeof body.discountPercent !== 'undefined') {
      body.discountType = 'PERCENT';
      body.discountValue = body.discountPercent;
      if (typeof body.minOrderAmountINR === 'undefined') {
        body.minOrderAmountINR = 0;
      }
      if (typeof body.perUserLimit === 'undefined') {
        body.perUserLimit = 1;
      }
    }

    // ── Admin: create coupon ──────────────────────────────────────────────────
    if (body && typeof body.discountValue !== 'undefined') {
      if (!(await isAuthorized(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const parsed = CreateCouponSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid request body', issues: parsed.error.issues }, { status: 400 });
      }

      // Validate: PERCENT coupons must be 1-100
      if (parsed.data.discountType === 'PERCENT' && parsed.data.discountValue > 100) {
        return NextResponse.json({ error: 'PERCENT discount value must be between 1 and 100' }, { status: 400 });
      }

      const coupon = await db.coupon.create({ data: parsed.data });
      await invalidateTags([CacheTags.coupons]);

      return NextResponse.json({ coupon: serializeCoupon(coupon) }, { status: 201 });
    }

    // ── Public/Logged-in: validate coupon ─────────────────────────────────────
    const parsed = ValidateCouponSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', issues: parsed.error.issues }, { status: 400 });
    }

    const { code, orderAmount } = parsed.data;

    // Check cache first (short TTL)
    const cacheKey = CacheKeys.coupons.byCode(code);
    let coupon = await cacheGet<any>(cacheKey);

    if (!coupon) {
      const raw = await db.coupon.findUnique({
        where:  { code },
        select: {
          id: true, code: true, discountType: true, discountValue: true,
          minOrderAmountINR: true, maxDiscountINR: true, maxUses: true,
          usedCount: true, perUserLimit: true, expiryDate: true, isActive: true,
        },
      });
      if (raw) {
        coupon = serializeCoupon(raw);
        await cacheSet(cacheKey, coupon, [CacheTags.coupons], COUPON_TTL);
      }
    }

    if (!coupon) return NextResponse.json({ error: 'Coupon not found' }, { status: 404 });
    if (!coupon.isActive) return NextResponse.json({ error: 'Coupon is not active' }, { status: 422 });
    if (new Date(coupon.expiryDate) < new Date()) return NextResponse.json({ error: 'Coupon has expired' }, { status: 422 });
    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      return NextResponse.json({ error: 'Coupon has reached its maximum uses' }, { status: 422 });
    }
    if (orderAmount !== undefined && orderAmount < coupon.minOrderAmountINR) {
      return NextResponse.json({ error: `Minimum order amount for this coupon is ₹${coupon.minOrderAmountINR}` }, { status: 422 });
    }

    // Check per-user limit if logged in
    const session = await getSession();
    const userId  = (session?.user as any)?.id as string | undefined;
    if (userId) {
      const usageCount = await db.couponUsage.count({
        where: { couponId: coupon.id, userId },
      });
      if (usageCount >= coupon.perUserLimit) {
        return NextResponse.json({ error: 'You have already used this coupon the maximum number of times' }, { status: 422 });
      }
    }

    // Calculate discount preview
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
      valid:            true,
      discountType:     coupon.discountType,
      discountValue:    coupon.discountValue,
      maxDiscountINR:   coupon.maxDiscountINR,
      minOrderAmountINR: coupon.minOrderAmountINR,
      discountAmountINR,
    });
  } catch (err: any) {
    if (err?.code === 'P2002') return NextResponse.json({ error: 'Coupon code already exists' }, { status: 409 });
    if (process.env.NODE_ENV !== 'production') console.error('[POST /api/coupons]', err);
    return NextResponse.json({ error: 'Failed to process coupon request' }, { status: 500 });
  }
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const cursor      = searchParams.get('cursor') ?? undefined;
    const limit       = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);
    const isActive    = searchParams.get('isActive');
    const search      = searchParams.get('search') ?? undefined;

    const params = new URLSearchParams({ cursor: cursor ?? '', limit: String(limit), isActive: isActive ?? '', search: search ?? '' }).toString();
    const cacheKey = CacheKeys.coupons.list(params);
    const cached = await cacheGet(cacheKey);
    if (cached) return NextResponse.json(cached);

    const where: Record<string, unknown> = {};
    if (isActive !== null && isActive !== '') where.isActive = isActive === 'true';
    if (search) where.code = { contains: search };

    const [coupons, total] = await Promise.all([
      db.coupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take:    limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      db.coupon.count({ where }),
    ]);

    const hasMore    = coupons.length > limit;
    const page       = hasMore ? coupons.slice(0, limit) : coupons;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    const result = { data: page.map(serializeCoupon), nextCursor, total };
    await cacheSet(cacheKey, result, [CacheTags.coupons], COUPON_LIST_TTL);

    return NextResponse.json(result);
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[GET /api/coupons]', err);
    return NextResponse.json({ error: 'Failed to fetch coupons' }, { status: 500 });
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(request: NextRequest) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: unknown = await request.json();
    const parsed = UpdateCouponSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', issues: parsed.error.issues }, { status: 400 });
    }

    const { id, ...updateData } = parsed.data;

    // Wrap existence check + update in a transaction to eliminate the TOCTOU window
    // where another admin could delete the coupon between the findUnique and the update.
    const coupon = await db.$transaction(async (tx) => {
      const existing = await tx.coupon.findUnique({ where: { id } });
      if (!existing) return null;

      const mergedType = updateData.discountType ?? existing.discountType;
      const mergedValue = updateData.discountValue ?? existing.discountValue;
      if (mergedType === 'PERCENT' && mergedValue > 100) {
        throw Object.assign(new Error('PERCENT discount value must be between 1 and 100'), { code: 'INVALID_PERCENT' });
      }

      return tx.coupon.update({ where: { id }, data: { ...updateData, updatedAt: new Date() } });
    });

    if (!coupon) {
      return NextResponse.json({ error: 'Coupon not found' }, { status: 404 });
    }

    await invalidateTags([CacheTags.coupons]);

    return NextResponse.json({ coupon: serializeCoupon(coupon) });
  } catch (err: any) {
    if (err?.code === 'INVALID_PERCENT') return NextResponse.json({ error: err.message }, { status: 400 });
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Coupon not found' }, { status: 404 });
    if (process.env.NODE_ENV !== 'production') console.error('[PATCH /api/coupons]', err);
    return NextResponse.json({ error: 'Failed to update coupon' }, { status: 500 });
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Coupon ID required' }, { status: 400 });

    // Wrap count + delete/update in a transaction to prevent a race where a new
    // CouponUsage row is inserted between the count read and the hard-delete.
    let message: string;
    await db.$transaction(async (tx) => {
      const usageCount = await tx.couponUsage.count({ where: { couponId: id } });
      if (usageCount > 0) {
        await tx.coupon.update({ where: { id }, data: { isActive: false, updatedAt: new Date() } });
        message = 'Coupon deactivated (has usage history, cannot be hard-deleted)';
      } else {
        await tx.coupon.delete({ where: { id } });
        message = 'Coupon deleted successfully';
      }
    });

    await invalidateTags([CacheTags.coupons]);
    return NextResponse.json({ success: true, message: message! });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Coupon not found' }, { status: 404 });
    if (process.env.NODE_ENV !== 'production') console.error('[DELETE /api/coupons]', err);
    return NextResponse.json({ error: 'Failed to delete coupon' }, { status: 500 });
  }
}
