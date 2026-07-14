import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import ProductFormClient from '../../ProductFormClient';

export const metadata = {
  title: 'Edit Product — Minara Creation',
};

export default async function EditProductPage({
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

  return <ProductFormClient mode="edit" productId={id} />;
}
