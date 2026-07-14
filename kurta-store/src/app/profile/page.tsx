import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import ProfileClient from './ProfileClient';

export const metadata = {
  title: 'My Account',
  description: 'Manage your Minara Creation account, view order history and update your preferences.',
};

export default async function ProfilePage() {
  const session = await auth();
  
  if (!session?.user) {
    redirect('/login');
  }

  return <ProfileClient session={session} />;
}
