import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import CollectionFormClient from '../CollectionFormClient';

export const metadata = {
  title: 'New Collection — Minara Creation',
};

export default async function NewCollectionPage() {
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

  return <CollectionFormClient mode="create" />;
}
