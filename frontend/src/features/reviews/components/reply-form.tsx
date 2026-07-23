'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, MessageSquareReply } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { reviewsService } from '@/services/reviews.service';

/** The shelter owner's single public reply. Scoped server-side to their own shelter's reviews. */
export function ReplyForm({ reviewId, existing }: { reviewId: string; existing?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(existing ?? '');
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;

    setPending(true);
    try {
      await reviewsService.reply(reviewId, body.trim());
      toast.success('Your response is live.');
      setOpen(false);
      router.refresh();
    } catch {
      toast.error('Could not post that reply. Please try again.');
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1.5 rounded-2xl">
        <MessageSquareReply className="size-3.5" aria-hidden />
        {existing ? 'Edit response' : 'Respond'}
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label htmlFor={`reply-${reviewId}`} className="sr-only">
        Your response
      </label>
      <textarea
        id={`reply-${reviewId}`}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={1000}
        rows={3}
        required
        placeholder="Thank them, or address what they raised. This is public."
        className="border-input bg-background focus-visible:ring-ring w-full resize-y rounded-2xl border px-4 py-2.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || !body.trim()} className="gap-1.5 rounded-2xl">
          {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
          Post response
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} className="rounded-2xl">
          Cancel
        </Button>
      </div>
    </form>
  );
}
