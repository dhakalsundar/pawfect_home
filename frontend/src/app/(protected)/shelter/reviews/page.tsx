import type { Metadata } from 'next';
import { MessageSquareQuote } from 'lucide-react';
import { RatingBreakdown } from '@/features/reviews/components/rating-breakdown';
import { ReviewCard } from '@/features/reviews/components/review-card';
import { ReplyForm } from '@/features/reviews/components/reply-form';
import { reviewsServer } from '@/services/reviews.server';

export const metadata: Metadata = {
  title: 'Reviews',
  robots: { index: false, follow: false },
};

/**
 * The shelter owner's view of their own reviews.
 *
 * Only approved reviews appear: a pending one is not yet a public statement, and showing it here
 * would invite a reply to something that may never be published.
 */
export default async function ShelterReviewsPage() {
  const [breakdown, { items, meta }] = await Promise.all([
    reviewsServer.myShelterBreakdown(),
    reviewsServer.forMyShelter({ limit: 50 }),
  ]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Reviews</h1>
        <p className="text-muted-foreground mt-1">
          What adopters are saying, and your responses.
        </p>
      </div>

      <div className="bg-card shadow-soft mb-8 rounded-2xl border p-6">
        <RatingBreakdown breakdown={breakdown} />
      </div>

      {items.length === 0 ? (
        <div className="text-muted-foreground rounded-2xl border border-dashed p-12 text-center">
          <MessageSquareQuote className="mx-auto mb-4 size-10 opacity-40" aria-hidden />
          <p className="text-foreground font-medium">No published reviews yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm">
            Reviews appear here once a moderator approves them.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {items.map((review) => (
            <li key={review.id}>
              <ReviewCard review={review}>
                <ReplyForm reviewId={review.id} existing={review.shelterReply?.body} />
              </ReviewCard>
            </li>
          ))}
        </ul>
      )}

      <p className="text-muted-foreground mt-6 text-sm">
        Showing {items.length} of {meta.total}.
      </p>
    </div>
  );
}
