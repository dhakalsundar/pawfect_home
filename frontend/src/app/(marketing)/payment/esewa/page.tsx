import { Suspense } from 'react';
import type { Metadata } from 'next';
import { EsewaCallback } from '@/features/donations/components/esewa-callback';

export const metadata: Metadata = {
  title: 'Confirming payment',
  // A transient verification screen carrying a gateway payload — never indexed.
  robots: { index: false, follow: false },
};

/**
 * eSewa's return target. `useSearchParams` (which holds the signed `data`) opts the subtree into
 * client rendering, so the Suspense boundary is required, not decorative.
 */
export default function EsewaCallbackPage() {
  return (
    <Suspense fallback={null}>
      <EsewaCallback />
    </Suspense>
  );
}
