import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  value: number;
  size?: 'sm' | 'md' | 'lg';
  /** Omit when an adjacent element already announces the rating, to avoid saying it twice. */
  label?: string;
  className?: string;
}

const SIZES = { sm: 'size-3.5', md: 'size-4', lg: 'size-5' } as const;

/**
 * Server Component — pure presentation, ships no JavaScript.
 *
 * The stars themselves are `aria-hidden`: they duplicate the number, and a screen reader hearing
 * "star star star" five times per review is noise. The value is announced once, in words.
 */
export function StarRating({ value, size = 'md', label, className }: Props) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      <span className="flex" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={cn(
              SIZES[size],
              star <= Math.round(value)
                ? 'fill-amber-brand text-amber-brand'
                : 'text-muted-foreground/30',
            )}
          />
        ))}
      </span>
      <span className="sr-only">{label ?? `Rated ${value} out of 5`}</span>
    </span>
  );
}
