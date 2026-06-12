import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Skeleton } from '@/components/ui/skeleton';
import { TwoFactorStep } from '@/features/auth/components/two-factor-step';

export const metadata: Metadata = {
  title: 'Two-factor verification',
  robots: { index: false, follow: false },
};

function FormSkeleton() {
  return (
    <div className="bg-card shadow-lift flex flex-col gap-4 rounded-2xl border p-6 sm:p-8">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-10 w-full rounded-xl" />
      <Skeleton className="h-10 w-full rounded-xl" />
    </div>
  );
}

/**
 * The standalone code step, reached when Google OAuth redirects a 2FA-enabled account here (the
 * pending cookie is already set). Credential logins collect the code inline on the login form
 * instead; both share the TwoFactorForm.
 */
export default function TwoFactorPage() {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <TwoFactorStep />
    </Suspense>
  );
}
