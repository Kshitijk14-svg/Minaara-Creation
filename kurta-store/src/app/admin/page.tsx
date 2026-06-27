import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { products, collections, coupons, orders } from '@/db/schema';
import { and, eq, gt, isNull, count, sum } from 'drizzle-orm';
import AdminClient from './AdminClient';

export const metadata = {
  title: 'Admin Dashboard — Minaara Creation',
  description: 'Manage products, collections, coupons, and orders.',
};

export default async function AdminPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  const role = (session.user as any).role as string;
  if (!['SUPER_ADMIN', 'ADMIN', 'STAFF'].includes(role)) {
    redirect('/');
  }

  // Prefetch stats server-side — session is already verified, no second auth() needed.
  let initialStats = null;
  try {
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

    initialStats = {
      totalProducts,
      totalCollections,
      activeCollections,
      activeCoupons,
      ordersToday,
      revenueToday: Number(revenueToday ?? 0),
    };
  } catch (err) {
    // Non-fatal: OverviewTab will fall back to its own client fetch
    if (process.env.NODE_ENV !== 'production') console.error('[AdminPage] stats prefetch failed:', err);
  }

  return <AdminClient session={session} initialStats={initialStats} />;
}
