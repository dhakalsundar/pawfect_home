import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Skeleton } from '@/components/ui/skeleton';
import { LoginForm } from '@/features/auth/components/login-form';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your PawfectHome account.',
  robots: { index: false, follow: false },
};

function FormSkeleton() {
  return (
    <div className="bg-card shadow-lift flex flex-col gap-4 rounded-2xl border p-6 sm:p-8">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-10 w-full rounded-xl" />
      <Skeleton className="h-10 w-full rounded-xl" />
      <Skeleton className="h-10 w-full rounded-xl" />
    </div>
  );
}

// useSearchParams (for ?callbackUrl and ?error) needs a Suspense boundary, or the whole
// route is forced out of static rendering.
export default function LoginPage() {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}
