import type { Metadata } from 'next';
import { ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ReviewCard } from '@/features/reviews/components/review-card';
import { ModerationActions } from '@/features/reviews/components/moderation-actions';
import { reviewsServer } from '@/services/reviews.server';

export const metadata: Metadata = {
  title: 'Review moderation',
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

/**
 * The moderation queue. Reviews default to `pending`, so nothing reaches the public until it has
 * passed through here — the opposite default would leave a defamatory post live until noticed.
 */
export default async function AdminReviewsPage({ searchParams }: PageProps) {
  const { status = 'pending' } = await searchParams;
  const { items, meta } = await reviewsServer.moderationQueue({ status, limit: 50 });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Review moderation</h1>
        <p className="text-muted-foreground mt-1">
          {meta.total} {status} review{meta.total === 1 ? '' : 's'}.
        </p>
      </div>

      {/* Plain links, not client-side tabs — the filter belongs in the URL so it is shareable. */}
      <nav aria-label="Filter by status" className="mb-6 flex flex-wrap gap-2">
        {['pending', 'approved', 'rejected'].map((value) => (
          <a
            key={value}
            href={`/admin/reviews?status=${value}`}
            aria-current={value === status ? 'page' : undefined}
            className={
              value === status
                ? 'bg-brand-50 text-primary-strong rounded-full px-4 py-1.5 text-sm font-medium capitalize'
                : 'text-muted-foreground hover:bg-muted rounded-full px-4 py-1.5 text-sm font-medium capitalize'
            }
          >
            {value}
          </a>
        ))}
      </nav>

      {items.length === 0 ? (
        <div className="text-muted-foreground rounded-2xl border border-dashed p-12 text-center">
          <ShieldCheck className="mx-auto mb-4 size-10 opacity-40" aria-hidden />
          <p className="text-foreground font-medium">Nothing to review</p>
          <p className="mt-1 text-sm">The {status} queue is empty.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {items.map((review) => (
            <li key={review.id}>
              <ReviewCard review={review}>
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant="secondary" className="capitalize">
                      {review.status}
                    </Badge>
                    {review.shelter ? (
                      <span className="text-muted-foreground">for {review.shelter.name}</span>
                    ) : null}
                  </div>
                  {review.moderationNote ? (
                    <p className="text-muted-foreground text-sm italic">
                      Previous note: {review.moderationNote}
                    </p>
                  ) : null}
                  <ModerationActions reviewId={review.id} status={review.status} />
                </div>
              </ReviewCard>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
