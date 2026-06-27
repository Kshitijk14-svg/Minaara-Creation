import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { products, collections, coupons, orders } from '@/db/schema';
import { isAuthorized } from '@/lib/api-auth';
import { and, eq, gt, isNull, count, sum } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const todayStart = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');

    const [
      [{ totalProducts }],
      [{ totalCollections }],
      [{ activeCollections }],
      [{ activeCoupons }],
      [{ ordersToday }],
      [{ revenueToday }],
    ] = await Promise.all([
      db.select({ totalProducts: count() }).from(products).where(isNull(products.deletedAt)),
      db.select({ totalCollections: count() }).from(collections),
      db.select({ activeCollections: count() }).from(collections).where(eq(collections.isActive, true)),
      db.select({ activeCoupons: count() }).from(coupons).where(
        and(eq(coupons.isActive, true), gt(coupons.expiryDate, new Date()))
      ),
      db.select({ ordersToday: count() }).from(orders).where(gt(orders.createdAt, todayStart)),
      db.select({ revenueToday: sum(orders.totalAmountINR) }).from(orders).where(gt(orders.createdAt, todayStart)),
    ]);

    return NextResponse.json({
      totalProducts,
      totalCollections,
      activeCollections,
      activeCoupons,
      ordersToday,
      revenueToday: Number(revenueToday ?? 0),
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[GET /api/admin/stats]', err);
    return NextResponse.json({ error: 'Failed to fetch admin stats' }, { status: 500 });
  }
}
