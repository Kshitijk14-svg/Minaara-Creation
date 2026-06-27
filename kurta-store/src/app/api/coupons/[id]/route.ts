/**
 * GET /api/coupons/[id]  — single coupon with usage stats (admin)
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { coupons, couponUsages, users, orders } from '@/db/schema';
import { isAuthorized } from '@/lib/api-auth';
import { desc, eq } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const [coupon] = await db
      .select()
      .from(coupons)
      .where(eq(coupons.id, id))
      .limit(1);

    if (!coupon) return NextResponse.json({ error: 'Coupon not found' }, { status: 404 });

    // Fetch last 50 usage records with user + order info
    const usageRows = await db
      .select({
        usedAt:          couponUsages.usedAt,
        userEmail:       users.email,
        userName:        users.name,
        orderId:         orders.id,
        orderNumber:     orders.orderNumber,
        totalAmountINR:  orders.totalAmountINR,
      })
      .from(couponUsages)
      .leftJoin(users,  eq(couponUsages.userId,  users.id))
      .leftJoin(orders, eq(couponUsages.orderId, orders.id))
      .where(eq(couponUsages.couponId, id))
      .orderBy(desc(couponUsages.usedAt))
      .limit(50);

    return NextResponse.json({
      coupon: {
        ...coupon,
        expiryDate: coupon.expiryDate.toISOString(),
        createdAt:  coupon.createdAt.toISOString(),
        updatedAt:  coupon.updatedAt.toISOString(),
        _count: { orders: usageRows.length },
        orders: usageRows.map((u) => ({
          usedAt: u.usedAt.toISOString(),
          user:   { email: u.userEmail, name: u.userName },
          order:  { id: u.orderId, orderNumber: u.orderNumber, totalAmountINR: u.totalAmountINR },
        })),
      },
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[GET /api/coupons/[id]]', err);
    return NextResponse.json({ error: 'Failed to fetch coupon' }, { status: 500 });
  }
}
