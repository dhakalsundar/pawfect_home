import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, Clock, HandCoins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/currency';

export const metadata: Metadata = {
  title: 'Thank you',
  // A redirect target carrying query params — never indexed.
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ method?: string; amount?: string }>;
}

/**
 * Shown after a donation is started. The copy is method-aware but never overclaims: settlement is
 * confirmed server-side (the eSewa verify step, or the shelter marking a pledge received), so this
 * page reflects what actually happened rather than trusting the redirect.
 */
export default async function DonationSuccessPage({ searchParams }: PageProps) {
  const { method, amount } = await searchParams;
  const paisa = amount ? Number.parseInt(amount, 10) : NaN;
  const amountLabel = Number.isFinite(paisa) ? formatCurrency(paisa) : null;

  const isCod = method === 'cod';

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
      <span
        className={
          isCod
            ? 'bg-amber-brand/10 text-amber-brand grid size-16 place-items-center rounded-full'
            : 'bg-success/10 text-success grid size-16 place-items-center rounded-full'
        }
      >
        {isCod ? (
          <HandCoins className="size-8" aria-hidden />
        ) : (
          <CheckCircle2 className="size-8" aria-hidden />
        )}
      </span>

      <h1 className="mt-6 text-3xl font-bold">
        {isCod ? 'Pledge recorded' : 'Thank you!'}
      </h1>

      {isCod ? (
        <p className="text-muted-foreground mt-3 leading-relaxed">
          Your pledge{amountLabel ? <> of <span className="text-foreground font-semibold">{amountLabel}</span></> : null}{' '}
          has been recorded. Please hand the cash to the shelter — they’ll confirm it once received,
          and it will then appear in your donation history.
        </p>
      ) : (
        <p className="text-muted-foreground mt-3 leading-relaxed">
          Your {amountLabel ? <span className="text-foreground font-semibold">{amountLabel}</span> : null} donation
          was received{amountLabel ? '' : ''}. Thank you for supporting these animals — your receipt
          is on its way by email.
        </p>
      )}

      {isCod ? (
        <p className="text-muted-foreground mt-6 flex items-center gap-2 text-sm">
          <Clock className="size-4 shrink-0" aria-hidden />
          Pending until the shelter confirms the cash.
        </p>
      ) : null}

      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg" className="bg-brand-gradient rounded-2xl text-white">
          <Link href="/pets">Meet the pets</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="rounded-2xl">
          <Link href="/dashboard/donations">View your donations</Link>
        </Button>
      </div>
    </div>
  );
}
