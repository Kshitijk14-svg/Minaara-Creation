import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
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

  return <AdminClient session={session} />;
}
