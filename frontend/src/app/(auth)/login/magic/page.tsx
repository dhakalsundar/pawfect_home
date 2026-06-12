import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Skeleton } from '@/components/ui/skeleton';
import { MagicLinkVerify } from '@/features/auth/components/magic-link-verify';

export const metadata: Metadata = {
  title: 'Signing you in',
  robots: { index: false, follow: false },
};

export default function MagicLinkPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-card shadow-lift rounded-2xl border p-6 sm:p-8">
          <Skeleton className="mx-auto h-8 w-8 rounded-full" />
        </div>
      }
    >
      <MagicLinkVerify />
    </Suspense>
  );
}
