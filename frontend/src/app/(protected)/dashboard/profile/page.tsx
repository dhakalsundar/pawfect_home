import type { Metadata } from 'next';
import { ProfileForm } from '@/features/dashboard/components/profile-form';
import { requireSession } from '@/services/session';

export const metadata: Metadata = {
  title: 'Profile',
  robots: { index: false, follow: false },
};

export default async function ProfilePage() {
  const user = await requireSession();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Profile</h1>
        <p className="text-muted-foreground mt-1">
          Shelters see this when you apply to adopt.
        </p>
      </div>

      <ProfileForm user={user} />
    </div>
  );
}
