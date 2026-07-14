import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import CouponFormClient from '../CouponFormClient';

export const metadata = {
  title: 'New Coupon — Minara Creation',
};

export default async function NewCouponPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  const role = (session.user as any).role as string;
  if (!['SUPER_ADMIN', 'ADMIN', 'STAFF'].includes(role)) {
    redirect('/');
  }

  return <CouponFormClient mode="create" />;
}
