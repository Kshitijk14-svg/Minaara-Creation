import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import AdminClient from './AdminClient';
import { getAdminStats } from '@/lib/admin-stats';
import { getProductsList, getCollectionsList, getCouponsList, getOrdersAdminList } from '@/lib/admin-list-queries';

export const metadata = {
  title: 'Admin Dashboard — Minaara Creation',
  description: 'Manage products, collections, coupons, and orders.',
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  const role = (session.user as any).role as string;
  if (!['SUPER_ADMIN', 'ADMIN', 'STAFF'].includes(role)) {
    redirect('/');
  }

  // Server-render the Overview tab's stats (the default landing tab) so it
  // paints with real numbers instead of a client-fetch skeleton. Other tabs
  // still lazy-fetch on first visit (Redis-cached). Never fail the whole page
  // if the stats query hiccups.
  const initialStats = await getAdminStats().catch(() => null);

  // Server-render whichever tab is active via `?tab=` so a direct link/reload
  // paints with real data instead of a skeleton → client-fetch waterfall.
  const { tab } = await searchParams;

  const [initialProductsData, initialCollectionsData, initialOrdersData, initialCouponsData] = await Promise.all([
    tab === 'products'    ? getProductsList({ limit: 20 }).catch(() => null) : null,
    tab === 'collections' ? getCollectionsList({ includeInactive: true }).catch(() => null) : null,
    tab === 'orders'      ? getOrdersAdminList({ limit: 20 }).catch(() => null) : null,
    tab === 'coupons'     ? getCouponsList({ limit: 20 }).catch(() => null) : null,
  ]);

  return (
    <AdminClient
      session={session}
      initialStats={initialStats}
      initialProductsData={initialProductsData}
      initialCollectionsData={initialCollectionsData}
      initialOrdersData={initialOrdersData}
      initialCouponsData={initialCouponsData}
    />
  );
}
