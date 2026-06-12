import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Skeleton } from '@/components/ui/skeleton';
import { RegisterForm } from '@/features/auth/components/register-form';

export const metadata: Metadata = {
  title: 'Create an account',
  description: 'Join PawfectHome to save favourites, apply to adopt, and message shelters.',
  robots: { index: false, follow: false },
};

function FormSkeleton() {
  return (
    <div className="bg-card shadow-lift flex flex-col gap-4 rounded-2xl border p-6 sm:p-8">
      <Skeleton className="h-8 w-52" />
      <Skeleton className="h-4 w-64" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-xl" />
      ))}
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <RegisterForm />
    </Suspense>
  );
}
