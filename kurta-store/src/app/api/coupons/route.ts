import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import type { Coupon } from '@/types/schema';

const ValidateCouponSchema = z.object({
  code: z.string().min(1).transform((s) => s.toUpperCase().trim()),
});

function dbCouponToSchema(c: {
  id: string;
  code: string;
  discountPercent: number;
  expiryDate: Date;
  isActive: boolean;
}): Coupon {
  return {
    id: c.id,
    code: c.code,
    discountPercent: c.discountPercent,
    expiryDate: c.expiryDate.toISOString(),
    isActive: c.isActive,
  };
}

// POST /api/coupons — validate a coupon code
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const parsed = ValidateCouponSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const coupon = await db.coupon.findUnique({
      where: { code: parsed.data.code },
      select: {
        id: true,
        code: true,
        discountPercent: true,
        expiryDate: true,
        isActive: true,
      },
    });

    if (!coupon) {
      return NextResponse.json({ error: 'Coupon not found' }, { status: 404 });
    }

    if (!coupon.isActive) {
      return NextResponse.json({ error: 'Coupon is inactive' }, { status: 422 });
    }

    if (coupon.expiryDate < new Date()) {
      return NextResponse.json({ error: 'Coupon has expired' }, { status: 422 });
    }

    return NextResponse.json({ discountPercent: coupon.discountPercent });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[POST /api/coupons]', err);
    }
    return NextResponse.json({ error: 'Failed to validate coupon' }, { status: 500 });
  }
}

// GET /api/coupons — admin list of all coupons
export async function GET(request: NextRequest) {
  try {
    // Admin auth
    const authHeader = request.headers.get('Authorization');
    const expectedToken = `Bearer ${process.env.ADMIN_SECRET_KEY}`;
    if (!authHeader || authHeader !== expectedToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const coupons = await db.coupon.findMany({
      select: {
        id: true,
        code: true,
        discountPercent: true,
        expiryDate: true,
        isActive: true,
      },
      orderBy: { expiryDate: 'desc' },
    });

    return NextResponse.json({ coupons: coupons.map(dbCouponToSchema) });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[GET /api/coupons]', err);
    }
    return NextResponse.json({ error: 'Failed to fetch coupons' }, { status: 500 });
  }
}
