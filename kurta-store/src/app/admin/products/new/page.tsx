import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import ProductFormClient from '../ProductFormClient';

export const metadata = {
  title: 'New Product — Minaara Creation',
};

export default async function NewProductPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  const role = (session.user as any).role as string;
  if (!['SUPER_ADMIN', 'ADMIN', 'STAFF'].includes(role)) {
    redirect('/');
  }
  if (role === 'STAFF') {
    redirect('/admin');
  }

  return <ProductFormClient mode="create" />;
}
