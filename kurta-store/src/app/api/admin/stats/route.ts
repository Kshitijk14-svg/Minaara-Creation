import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isAuthorized } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const todayStart = new Date(todayStr + 'T00:00:00.000Z');

    const [
      totalProducts,
      totalCollections,
      activeCollections,
      activeCoupons,
      todayOrders,
    ] = await Promise.all([
      db.product.count({ where: { deletedAt: null } }),
      db.collection.count(),
      db.collection.count({ where: { isActive: true } }),
      db.coupon.count({ where: { isActive: true, expiryDate: { gt: new Date() } } }),
      db.order.findMany({
        where: { createdAt: { gte: todayStart } },
        select: { totalAmountINR: true },
      }),
    ]);

    const ordersToday = todayOrders.length;
    const revenueToday = todayOrders.reduce((sum, o) => sum + o.totalAmountINR, 0);

    return NextResponse.json({
      totalProducts,
      totalCollections,
      activeCollections,
      activeCoupons,
      ordersToday,
      revenueToday,
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[GET /api/admin/stats]', err);
    return NextResponse.json({ error: 'Failed to fetch admin stats' }, { status: 500 });
  }
}
