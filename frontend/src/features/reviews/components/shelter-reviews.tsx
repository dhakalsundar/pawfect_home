import Link from 'next/link';
import { RatingBreakdown } from './rating-breakdown';
import { ReviewCard } from './review-card';
import { HelpfulButton } from './helpful-button';
import { reviewsServer } from '@/services/reviews.server';

interface Props {
  shelterId: string;
  shelterName: string;
  /** How many to show inline; the rest sit behind the "all reviews" link. */
  limit?: number;
}

/**
 * Server Component. Fetches its own data so the caller can drop it behind a <Suspense> boundary
 * scoped to just this section — a slow review query must not hold up the page around it.
 */
export async function ShelterReviews({ shelterId, shelterName, limit = 3 }: Props) {
  const [breakdown, { items, meta }] = await Promise.all([
    reviewsServer.breakdown(shelterId),
    reviewsServer.forShelter(shelterId, { limit, sort: 'helpful' }),
  ]);

  return (
    <section aria-labelledby="reviews-heading" className="mt-12">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <h2 id="reviews-heading" className="text-2xl font-bold">
          What adopters say about {shelterName}
        </h2>
        {meta.total > items.length ? (
          <Link
            href={`/reviews?shelterId=${shelterId}`}
            className="text-primary-strong text-sm underline-offset-2 hover:underline"
          >
            All {meta.total} reviews
          </Link>
        ) : null}
      </div>

      <div className="bg-card shadow-soft mb-6 rounded-2xl border p-6">
        <RatingBreakdown breakdown={breakdown} />
      </div>

      {items.length > 0 ? (
        <ul className="grid gap-4 md:grid-cols-2">
          {items.map((review) => (
            <li key={review.id}>
              <ReviewCard review={review}>
                <HelpfulButton
                  reviewId={review.id}
                  initialCount={review.helpfulCount}
                  initialMarked={review.markedHelpful ?? false}
                />
              </ReviewCard>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Matches the real section's shape so the layout does not jump when it resolves. */
export function ShelterReviewsSkeleton() {
  return (
    <section className="mt-12" aria-busy="true" aria-label="Loading reviews">
      <div className="bg-muted/60 mb-6 h-8 w-72 animate-pulse rounded-lg" />
      <div className="bg-muted/60 mb-6 h-44 animate-pulse rounded-2xl" />
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="bg-muted/60 h-48 animate-pulse rounded-2xl" />
        ))}
      </div>
    </section>
  );
}
