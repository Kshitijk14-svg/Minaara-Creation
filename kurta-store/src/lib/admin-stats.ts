/**
 * Admin dashboard summary stats. Shared by the API route (client refetch) and
 * the admin server page (server-rendered initial data), so the Overview tab
 * paints with real numbers instead of a loading skeleton.
 */
import { db } from '@/db/index';
import { products, collections, coupons, orders } from '@/db/schema';
import { cacheGet, cacheSet } from '@/lib/cache';
import { and, eq, gt, isNull, count, sum } from 'drizzle-orm';

const STATS_TTL = 60;

export interface AdminStats {
  totalProducts: number;
  totalCollections: number;
  activeCollections: number;
  activeCoupons: number;
  ordersToday: number;
  revenueToday: number;
}

export async function getAdminStats(): Promise<AdminStats> {
  const todayStr  = new Date().toISOString().slice(0, 10);
  const cacheKey  = `admin:stats:${todayStr}`;

  const cached = await cacheGet<AdminStats>(cacheKey);
  if (cached) return cached;

  const todayStart = new Date(todayStr + 'T00:00:00.000Z');

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

  const result: AdminStats = {
    totalProducts,
    totalCollections,
    activeCollections,
    activeCoupons,
    ordersToday,
    revenueToday: Number(revenueToday ?? 0),
  };

  await cacheSet(cacheKey, result, ['admin-stats'], STATS_TTL);
  return result;
}
