import Image from 'next/image';
import { BadgeCheck, MessageSquareReply } from 'lucide-react';
import { StarRating } from './star-rating';
import { timeAgo } from '@/types/notification';
import type { Review } from '@/types/review';

/** Server Component — the helpful button is a separate client leaf, passed in as a child. */
export function ReviewCard({ review, children }: { review: Review; children?: React.ReactNode }) {
  return (
    <article className="bg-card shadow-soft rounded-2xl border p-5">
      <header className="flex items-start gap-3">
        <div className="bg-muted relative size-10 shrink-0 overflow-hidden rounded-full">
          {review.author.avatar ? (
            <Image src={review.author.avatar} alt="" fill sizes="40px" className="object-cover" />
          ) : (
            <span className="text-muted-foreground flex size-full items-center justify-center text-sm font-semibold">
              {review.author.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="font-semibold">{review.author.name}</p>
            {review.verified ? (
              // The badge is derived from a completed adoption server-side; it cannot be claimed.
              <span className="text-success bg-success/10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
                <BadgeCheck className="size-3.5" aria-hidden />
                Verified adopter
              </span>
            ) : null}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <StarRating value={review.rating} size="sm" label={`${review.rating} out of 5 stars`} />
            <time dateTime={review.createdAt} className="text-muted-foreground text-xs">
              {timeAgo(review.createdAt)}
            </time>
          </div>
        </div>
      </header>

      {review.title ? <h3 className="mt-4 font-semibold">{review.title}</h3> : null}

      <p className="text-muted-foreground mt-2 leading-relaxed">{review.comment}</p>

      {review.images.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {review.images.map((image) => (
            <li key={image.url} className="relative size-20 overflow-hidden rounded-xl">
              <Image src={image.url} alt="" fill sizes="80px" className="object-cover" />
            </li>
          ))}
        </ul>
      ) : null}

      {review.shelterReply ? (
        <div className="bg-muted/50 mt-4 rounded-xl p-4">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <MessageSquareReply className="text-primary-strong size-4" aria-hidden />
            Response from {review.shelter?.name ?? 'the shelter'}
          </p>
          <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
            {review.shelterReply.body}
          </p>
          <time dateTime={review.shelterReply.at} className="text-muted-foreground mt-2 block text-xs">
            {timeAgo(review.shelterReply.at)}
          </time>
        </div>
      ) : null}

      {children ? <div className="mt-4">{children}</div> : null}
    </article>
  );
}
