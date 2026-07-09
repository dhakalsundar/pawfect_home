import type { Metadata } from 'next';
import Link from 'next/link';
import { RefreshCw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Payment not completed',
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ method?: string; reason?: string }>;
}

/** Why the payment didn't go through, in plain language. Nothing was charged in any of these. */
const REASONS: Record<string, string> = {
  amount_mismatch: 'The amount reported by eSewa didn’t match your donation, so we didn’t record it.',
  not_complete: 'The payment was cancelled or didn’t complete at eSewa.',
  invalid_signature: 'We couldn’t verify the response from eSewa, so nothing was recorded.',
  unknown: 'We couldn’t match this payment to a donation.',
  error: 'Something went wrong while confirming your payment.',
};

export default async function DonationFailedPage({ searchParams }: PageProps) {
  const { reason } = await searchParams;
  const explanation =
    (reason && REASONS[reason]) ?? 'Your payment was not completed, so nothing was charged.';

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
      <span className="bg-destructive/10 text-destructive grid size-16 place-items-center rounded-full">
        <XCircle className="size-8" aria-hidden />
      </span>

      <h1 className="mt-6 text-3xl font-bold">Payment not completed</h1>
      <p className="text-muted-foreground mt-3 leading-relaxed">{explanation}</p>
      <p className="text-muted-foreground mt-2 text-sm">
        You have not been charged. You’re welcome to try again.
      </p>

      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg" className="bg-brand-gradient gap-2 rounded-2xl text-white">
          <Link href="/donate">
            <RefreshCw className="size-4" aria-hidden />
            Try again
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="rounded-2xl">
          <Link href="/pets">Browse pets</Link>
        </Button>
      </div>
    </div>
  );
}
