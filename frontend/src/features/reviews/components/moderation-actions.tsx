'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { reviewsService } from '@/services/reviews.service';

/**
 * Approve / reject, with an optional note.
 *
 * Both actions recompute the shelter's cached average server-side — including rejecting a review
 * that was previously approved, which has to take it back out of the mean.
 */
export function ModerationActions({ reviewId, status }: { reviewId: string; status: string }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [pending, setPending] = useState<'approved' | 'rejected' | null>(null);

  async function moderate(next: 'approved' | 'rejected') {
    setPending(next);
    try {
      await reviewsService.moderate(reviewId, next, note.trim() || undefined);
      toast.success(next === 'approved' ? 'Review published.' : 'Review rejected.');
      router.refresh();
    } catch {
      toast.error('Could not update that review. Please try again.');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={500}
        placeholder="Note to the author (optional)"
        aria-label="Moderation note"
        className="rounded-2xl sm:flex-1"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => void moderate('approved')}
          disabled={pending !== null || status === 'approved'}
          className="gap-1.5 rounded-2xl"
        >
          {pending === 'approved' ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Check className="size-3.5" aria-hidden />
          )}
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void moderate('rejected')}
          disabled={pending !== null || status === 'rejected'}
          className="gap-1.5 rounded-2xl"
        >
          {pending === 'rejected' ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <X className="size-3.5" aria-hidden />
          )}
          Reject
        </Button>
      </div>
    </div>
  );
}
