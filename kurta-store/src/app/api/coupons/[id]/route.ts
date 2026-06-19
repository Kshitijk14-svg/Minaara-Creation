/**
 * GET   /api/coupons/[id]  — single coupon with usage stats (admin)
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isAuthorized } from '@/lib/api-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const coupon = await db.coupon.findUnique({
      where: { id },
      include: {
        _count: { select: { orders: true } },
        orders: {
          select: {
            usedAt: true,
            user:  { select: { email: true, name: true } },
            order: { select: { id: true, orderNumber: true, totalAmountINR: true } },
          },
          orderBy: { usedAt: 'desc' },
          take: 50, // last 50 uses
        },
      },
    });

    if (!coupon) return NextResponse.json({ error: 'Coupon not found' }, { status: 404 });

    return NextResponse.json({
      coupon: {
        ...coupon,
        expiryDate: coupon.expiryDate.toISOString(),
        createdAt:  coupon.createdAt.toISOString(),
        updatedAt:  coupon.updatedAt.toISOString(),
        orders: coupon.orders.map((u) => ({
          ...u,
          usedAt: u.usedAt.toISOString(),
        })),
      },
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[GET /api/coupons/[id]]', err);
    return NextResponse.json({ error: 'Failed to fetch coupon' }, { status: 500 });
  }
}
