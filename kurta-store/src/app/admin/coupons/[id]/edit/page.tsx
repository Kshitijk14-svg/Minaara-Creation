import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import CouponFormClient from '../../CouponFormClient';

export const metadata = {
  title: 'Edit Coupon — Minaara Creation',
};

export default async function EditCouponPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  const role = (session.user as any).role as string;
  if (!['SUPER_ADMIN', 'ADMIN', 'STAFF'].includes(role)) {
    redirect('/');
  }

  const { id } = await params;

  return <CouponFormClient mode="edit" couponId={id} />;
}
