'use client';

import { useState } from 'react';
import { ThumbsUp } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/providers/auth-provider';
import { reviewsService } from '@/services/reviews.service';
import { cn } from '@/lib/utils';

interface Props {
  reviewId: string;
  initialCount: number;
  initialMarked: boolean;
}

/**
 * Optimistic toggle.
 *
 * The server treats the vote as set membership rather than an increment, so a double-click cannot
 * inflate the count — which is what makes optimism safe here. On failure we adopt the server's
 * number rather than guessing at a rollback.
 */
export function HelpfulButton({ reviewId, initialCount, initialMarked }: Props) {
  const { isAuthenticated } = useAuth();
  const [count, setCount] = useState(initialCount);
  const [marked, setMarked] = useState(initialMarked);
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (!isAuthenticated) {
      toast('Sign in to mark reviews as helpful.');
      return;
    }

    const previous = { count, marked };
    setMarked(!marked);
    setCount(marked ? count - 1 : count + 1);
    setPending(true);

    try {
      const result = await reviewsService.toggleHelpful(reviewId);
      setCount(result.helpfulCount);
      setMarked(result.markedHelpful);
    } catch {
      setCount(previous.count);
      setMarked(previous.marked);
      toast.error('Could not record that. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={pending}
      aria-pressed={marked}
      className={cn(
        'focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none',
        marked
          ? 'border-primary bg-brand-50 text-primary-strong'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <ThumbsUp className="size-3.5" aria-hidden />
      Helpful
      {count > 0 ? <span className="tabular-nums">({count})</span> : null}
    </button>
  );
}
