'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Star } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { reviewsService } from '@/services/reviews.service';
import { ApiError } from '@/services/api-error';
import { cn } from '@/lib/utils';
import type { Review } from '@/types/review';

interface Props {
  shelterId: string;
  shelterName: string;
  /** Present when editing rather than creating. */
  existing?: Review | null;
  onDone?: () => void;
}

export function ReviewForm({ shelterId, shelterName, existing, onDone }: Props) {
  const router = useRouter();

  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [hovered, setHovered] = useState(0);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [comment, setComment] = useState(existing?.comment ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (rating < 1) {
      setError('Please choose a star rating.');
      return;
    }
    if (comment.trim().length < 10) {
      setError('Please write at least 10 characters.');
      return;
    }

    setPending(true);
    try {
      if (existing) {
        await reviewsService.update(existing.id, {
          rating,
          title: title.trim(),
          comment: comment.trim(),
        });
        toast.success('Review updated — it will reappear once a moderator approves it.');
      } else {
        await reviewsService.create({
          shelterId,
          rating,
          ...(title.trim() ? { title: title.trim() } : {}),
          comment: comment.trim(),
        });
        toast.success('Thank you — your review will appear once a moderator approves it.');
      }
      router.refresh();
      onDone?.();
    } catch (caught) {
      // A 409 here means the unique index rejected a duplicate; the API's message says so.
      const message =
        caught instanceof ApiError ? caught.message : 'Something went wrong. Please try again.';
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <fieldset>
        <legend className="text-sm font-medium">Your rating of {shelterName}</legend>
        {/*
          Radio buttons under the hood, not click handlers on icons: this gives keyboard
          navigation, focus, and a real accessible name for each star at no cost.
        */}
        <div className="mt-2 flex gap-1" onMouseLeave={() => setHovered(0)}>
          {[1, 2, 3, 4, 5].map((star) => (
            <label
              key={star}
              className="focus-within:ring-ring cursor-pointer rounded p-0.5 focus-within:ring-2"
              onMouseEnter={() => setHovered(star)}
            >
              <input
                type="radio"
                name="rating"
                value={star}
                checked={rating === star}
                onChange={() => setRating(star)}
                className="sr-only"
              />
              <Star
                className={cn(
                  'size-8 transition-colors',
                  star <= (hovered || rating)
                    ? 'fill-amber-brand text-amber-brand'
                    : 'text-muted-foreground/30',
                )}
                aria-hidden
              />
              <span className="sr-only">
                {star} star{star === 1 ? '' : 's'}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <Label htmlFor="review-title">Title (optional)</Label>
        <Input
          id="review-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={100}
          placeholder="Sum it up in a few words"
          className="mt-1.5 rounded-2xl"
        />
      </div>

      <div>
        <Label htmlFor="review-comment">Your review</Label>
        <textarea
          id="review-comment"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          minLength={10}
          maxLength={1000}
          rows={5}
          required
          placeholder="What was the adoption process like? How were the staff? Would you recommend them?"
          className="border-input bg-background focus-visible:ring-ring mt-1.5 w-full resize-y rounded-2xl border px-4 py-2.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
        />
        <p className="text-muted-foreground mt-1 text-xs">{comment.length}/1000</p>
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          disabled={pending}
          className="bg-brand-gradient gap-2 rounded-2xl text-white"
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {existing ? 'Update review' : 'Post review'}
        </Button>
        {onDone ? (
          <Button type="button" variant="ghost" onClick={onDone} className="rounded-2xl">
            Cancel
          </Button>
        ) : null}
      </div>

      <p className="text-muted-foreground text-xs">
        Reviews are checked by a moderator before they appear publicly.
      </p>
    </form>
  );
}
