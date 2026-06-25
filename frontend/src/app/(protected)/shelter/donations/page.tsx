import type { Metadata } from 'next';
import { HandCoins, HeartHandshake } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { MarkReceivedButton } from '@/features/donations/components/mark-received-button';
import { donationsServer } from '@/services/donations.server';
import { formatCurrency } from '@/lib/currency';
import type { DonationStatus, PaymentMethod } from '@/types/donation';

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

const METHOD_LABEL: Record<PaymentMethod, string> = {
  esewa: 'eSewa',
  cod: 'Cash',
  stripe: 'Card',
};

export default async function ShelterDonationsPage() {
  const { items, meta } = await donationsServer.list({ limit: 50 });

  // Settled money received, and the pledges still awaiting cash.
  const received = items
    .filter((donation) => donation.status === 'succeeded')
    .reduce((sum, donation) => sum + donation.amount, 0);
  const pendingCod = items.filter(
    (donation) => donation.status === 'pending' && donation.paymentMethod === 'cod',
  ).length;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Donations</h1>
        <p className="text-muted-foreground mt-1">
          {meta.total === 0
            ? 'No donations yet.'
            : `${formatCurrency(received)} received${pendingCod > 0 ? ` · ${pendingCod} cash pledge${pendingCod === 1 ? '' : 's'} to confirm` : ''}`}
        </p>
      </div>

      {items.length === 0 ? (
        <div className="text-muted-foreground rounded-2xl border border-dashed p-12 text-center">
          <HeartHandshake className="mx-auto mb-4 size-10 opacity-40" aria-hidden />
          <p className="text-foreground font-medium">No donations yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm">
            Donations to your shelter — online and cash pledges — will appear here.
          </p>
        </div>
      ) : (
        <div className="bg-card shadow-soft overflow-hidden rounded-2xl border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Donations to your shelter</caption>
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-3 text-left font-medium">Date</th>
                  <th scope="col" className="px-5 py-3 text-left font-medium">Donor</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Amount</th>
                  <th scope="col" className="px-5 py-3 text-left font-medium">Method</th>
                  <th scope="col" className="px-5 py-3 text-left font-medium">Status</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Action</th>
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
                    <td className="px-5 py-4">{donation.donorName}</td>
                    <td className="px-5 py-4 text-right font-semibold tabular-nums whitespace-nowrap">
                      {formatCurrency(donation.amount)}
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-muted-foreground inline-flex items-center gap-1.5">
                        {donation.paymentMethod === 'cod' ? (
                          <HandCoins className="size-3.5" aria-hidden />
                        ) : null}
                        {METHOD_LABEL[donation.paymentMethod]}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <Badge variant={STATUS_VARIANT[donation.status]} className="capitalize">
                        {donation.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-right">
                      {donation.status === 'pending' && donation.paymentMethod === 'cod' ? (
                        <MarkReceivedButton donationId={donation.id} />
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
