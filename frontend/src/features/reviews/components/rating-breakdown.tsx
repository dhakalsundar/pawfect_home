import { StarRating } from './star-rating';
import type { RatingBreakdown as Breakdown } from '@/types/review';

/** Server Component — the distribution bars beside the average. */
export function RatingBreakdown({ breakdown }: { breakdown: Breakdown }) {
  const { average, count, distribution } = breakdown;

  if (count === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No reviews yet — be the first to share your experience.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
      <div className="text-center sm:w-40 sm:shrink-0">
        <p className="text-brand-gradient text-5xl font-bold tabular-nums">
          {average.toFixed(1)}
        </p>
        <StarRating value={average} size="lg" label={`Average ${average} out of 5`} className="mt-2" />
        <p className="text-muted-foreground mt-1 text-sm">
          {count} {count === 1 ? 'review' : 'reviews'}
        </p>
      </div>

      <ul className="flex-1 space-y-1.5">
        {[5, 4, 3, 2, 1].map((star) => {
          const value = distribution[String(star)] ?? 0;
          // Percentages are of the total, so the bars are comparable across shelters.
          const percent = count > 0 ? Math.round((value / count) * 100) : 0;

          return (
            <li key={star} className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground w-12 shrink-0 tabular-nums">
                {star} star{star === 1 ? '' : 's'}
              </span>
              {/*
                A real progressbar rather than a styled div: assistive tech announces the
                proportion, which is the entire content of this row.
              */}
              <span
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${star} star: ${value} of ${count} reviews`}
                className="bg-muted h-2 flex-1 overflow-hidden rounded-full"
              >
                <span
                  className="bg-brand-gradient block h-full rounded-full"
                  style={{ width: `${percent}%` }}
                />
              </span>
              <span className="text-muted-foreground w-8 shrink-0 text-right tabular-nums">
                {value}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
