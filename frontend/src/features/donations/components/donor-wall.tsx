import { Heart, Quote } from 'lucide-react';
import { formatMoney, type Donation } from '@/types/donation';
import { timeAgo } from '@/types/notification';

/** Server Component — pure content, ships no JavaScript. */
export function DonorWall({ donations }: { donations: Donation[] }) {
  if (donations.length === 0) {
    return (
      <div className="text-muted-foreground rounded-2xl border border-dashed p-8 text-center">
        <Heart className="mx-auto mb-3 size-8 opacity-40" aria-hidden />
        <p className="font-medium">No donations yet</p>
        <p className="mt-1 text-sm">Be the first to support these animals.</p>
      </div>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {donations.map((donation) => (
        <li
          key={donation.id}
          className="bg-card shadow-soft hover-lift flex flex-col rounded-2xl border p-5"
        >
          <div className="flex items-baseline justify-between gap-3">
            {/* Anonymity is applied server-side; this only ever receives the masked name. */}
            <p className="truncate font-semibold">{donation.donorName}</p>
            <span className="text-brand-gradient shrink-0 font-bold">
              {formatMoney(donation.amount)}
            </span>
          </div>

          {donation.shelter ? (
            <p className="text-muted-foreground mt-0.5 truncate text-xs">
              to {donation.shelter.name}
            </p>
          ) : null}

          {donation.message ? (
            <blockquote className="text-muted-foreground mt-3 flex-1 text-sm leading-relaxed">
              <Quote className="text-primary-strong/30 mb-1 size-4" aria-hidden />
              {donation.message}
            </blockquote>
          ) : (
            <div className="flex-1" />
          )}

          <time dateTime={donation.createdAt} className="text-muted-foreground mt-3 text-xs">
            {timeAgo(donation.createdAt)}
          </time>
        </li>
      ))}
    </ul>
  );
}
