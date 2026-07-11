import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import CollectionFormClient from '../../CollectionFormClient';

export const metadata = {
  title: 'Edit Collection — Minaara Creation',
};

export default async function EditCollectionPage({
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
  if (role === 'STAFF') {
    redirect('/admin');
  }

  const { id } = await params;

  return <CollectionFormClient mode="edit" collectionId={id} />;
}
