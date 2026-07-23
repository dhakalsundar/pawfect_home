import type { Metadata } from 'next';
import Link from 'next/link';
import { ExternalLink, HeartHandshake } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { donationsServer } from '@/services/donations.server';
import { formatMoney, type DonationStatus } from '@/types/donation';

export const metadata: Metadata = {
  title: 'Donations',
  robots: { index: false, follow: false },
};

const STATUS_VARIANT: Record<DonationStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  succeeded: 'default',
  pending: 'secondary',
  failed: 'destructive',
  refunded: 'outline',
};

export default async function DonationsPage() {
  const { items, meta } = await donationsServer.list({ limit: 50 });

  // Only settled money counts towards the total the donor sees.
  const lifetime = items
    .filter((donation) => donation.status === 'succeeded')
    .reduce((sum, donation) => sum + donation.amount, 0);

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Donations</h1>
          <p className="text-muted-foreground mt-1">
            {meta.total === 0
              ? 'You have not made a donation yet.'
              : `${meta.total} donation${meta.total === 1 ? '' : 's'} · ${formatMoney(lifetime)} given`}
          </p>
        </div>
        <Button asChild className="bg-brand-gradient gap-2 rounded-2xl text-white">
          <Link href="/donate">
            <HeartHandshake className="size-4" aria-hidden />
            Donate
          </Link>
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="text-muted-foreground rounded-2xl border border-dashed p-12 text-center">
          <HeartHandshake className="mx-auto mb-4 size-10 opacity-40" aria-hidden />
          <p className="text-foreground font-medium">No donations yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm">
            Every shelter here runs on donations. Even a small one covers a meal.
          </p>
        </div>
      ) : (
        <div className="bg-card shadow-soft overflow-hidden rounded-2xl border">
          {/* The table scrolls inside its own container so the page never scrolls sideways. */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Your donation history</caption>
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-3 text-left font-medium">Date</th>
                  <th scope="col" className="px-5 py-3 text-left font-medium">To</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Amount</th>
                  <th scope="col" className="px-5 py-3 text-left font-medium">Status</th>
                  <th scope="col" className="px-5 py-3 text-left font-medium">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-border/60 divide-y">
                {items.map((donation) => (
                  <tr key={donation.id}>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <time dateTime={donation.createdAt}>
                        {new Date(donation.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </time>
                    </td>
                    <td className="px-5 py-4">
                      {donation.shelter ? (
                        <Link
                          href={`/shelters/${donation.shelter.slug}`}
                          className="hover:text-primary-strong underline-offset-2 hover:underline"
                        >
                          {donation.shelter.name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">PawfectHome</span>
                      )}
                      {donation.type === 'monthly' ? (
                        <span className="text-muted-foreground block text-xs">Monthly</span>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 text-right font-semibold tabular-nums whitespace-nowrap">
                      {formatMoney(donation.amount)}
                    </td>
                    <td className="px-5 py-4">
                      <Badge variant={STATUS_VARIANT[donation.status]} className="capitalize">
                        {donation.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-4">
                      {donation.receiptUrl ? (
                        <a
                          href={donation.receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-strong inline-flex items-center gap-1 underline-offset-2 hover:underline"
                        >
                          View
                          <ExternalLink className="size-3" aria-hidden />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
