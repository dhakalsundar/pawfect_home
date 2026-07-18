import type { Metadata } from 'next';
import Link from 'next/link';
import { Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ReviewCard } from '@/features/reviews/components/review-card';
import { reviewsServer } from '@/services/reviews.server';
import type { ReviewStatus } from '@/types/review';

export const metadata: Metadata = {
  title: 'My reviews',
  robots: { index: false, follow: false },
};

const STATUS_COPY: Record<ReviewStatus, { variant: 'default' | 'secondary' | 'destructive'; help: string }> = {
  approved: { variant: 'default', help: 'Live on the site.' },
  pending: { variant: 'secondary', help: 'Waiting for a moderator.' },
  rejected: { variant: 'destructive', help: 'Not published.' },
};

export default async function MyReviewsPage() {
  const { items, meta } = await reviewsServer.mine({ limit: 50 });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">My reviews</h1>
        <p className="text-muted-foreground mt-1">
          {meta.total === 0
            ? 'You have not written a review yet.'
            : `${meta.total} review${meta.total === 1 ? '' : 's'}, in every state.`}
        </p>
      </div>

      {items.length === 0 ? (
        <div className="text-muted-foreground rounded-2xl border border-dashed p-12 text-center">
          <Star className="mx-auto mb-4 size-10 opacity-40" aria-hidden />
          <p className="text-foreground font-medium">No reviews yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm">
            Adopted recently? Reviews help other people choose a shelter with confidence.
          </p>
          <Link href="/pets" className="text-primary-strong mt-4 inline-block text-sm underline-offset-2 hover:underline">
            Browse pets
          </Link>
        </div>
      ) : (
        <ul className="space-y-4">
          {items.map((review) => {
            const copy = STATUS_COPY[review.status];
            return (
              <li key={review.id}>
                <ReviewCard review={review}>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant={copy.variant} className="capitalize">
                      {review.status}
                    </Badge>
                    <span className="text-muted-foreground">{copy.help}</span>
                    {review.moderationNote ? (
                      <span className="text-muted-foreground w-full italic">
                        Moderator: {review.moderationNote}
                      </span>
                    ) : null}
                  </div>
                </ReviewCard>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
