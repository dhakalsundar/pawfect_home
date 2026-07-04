'use client';

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { donationsService } from '@/services/donations.service';

/**
 * Where eSewa sends the browser back to.
 *
 * The redirect is only a signal — it proves nothing on its own. This posts the signed `data` blob
 * to the backend, which verifies the signature, amount and status server-side and settles the
 * donation, then routes to the success or failed page based on the outcome. The `useRef` guard
 * stops React's dev double-effect (or a back-button) from POSTing the same blob twice; the backend
 * is idempotent anyway, but there is no reason to fire it twice.
 */
export function EsewaCallback() {
  const router = useRouter();
  const params = useSearchParams();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    // eSewa appends its signed response as `?data=<base64>` to the success_url. Its absence means
    // we did not arrive from a completed payment (failure goes to a separate path).
    const data = params.get('data');
    if (!data) {
      router.replace('/donate/failed?method=esewa');
      return;
    }

    void (async () => {
      try {
        const result = await donationsService.verifyEsewa(data);
        if (result.outcome === 'succeeded' || result.outcome === 'duplicate') {
          const query = new URLSearchParams({ method: 'esewa' });
          if (result.donation) query.set('amount', String(result.donation.amount));
          router.replace(`/donate/success?${query.toString()}`);
        } else {
          router.replace(`/donate/failed?method=esewa&reason=${result.outcome}`);
        }
      } catch {
        router.replace('/donate/failed?method=esewa&reason=error');
      }
    })();
  }, [params, router]);

  return (
    <div
      className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="text-primary-strong size-10 animate-spin" aria-hidden />
      <h1 className="mt-6 text-2xl font-bold">Confirming your payment…</h1>
      <p className="text-muted-foreground mt-2">
        Please wait while we verify your eSewa transaction. Don’t close this page.
      </p>
    </div>
  );
}
