'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Eye, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { shelterService } from '@/services/shelter.service';
import { isApiError } from '@/services/api-error';
import type { ApplicationStatus } from '@/types/adoption';

type Action = 'under_review' | 'approved' | 'rejected' | 'completed';

export function ApplicationActions({
  applicationId,
  status,
  applicantName,
  petName,
}: {
  applicationId: string;
  status: ApplicationStatus;
  applicantName: string;
  petName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);

  async function apply(action: Action, reason?: string) {
    setBusy(true);
    try {
      await shelterService.updateApplicationStatus(applicationId, action, reason);
      toast.success(
        action === 'completed'
          ? `${petName} marked adopted. Other open applications were closed and applicants notified.`
          : `${applicantName}'s application is now ${action.replace('_', ' ')}.`,
      );
      setRejecting(false);
      setNote('');
      router.refresh();
    } catch (error) {
      toast.error(isApiError(error) ? error.message : 'Could not update. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function submitRejection() {
    // The API enforces this too; checking here saves a round trip and reads better.
    if (note.trim().length < 10) {
      setNoteError('Please give at least a brief reason (10 characters).');
      return;
    }
    setNoteError(null);
    void apply('rejected', note.trim());
  }

  if (rejecting) {
    return (
      <div className="border-destructive/30 bg-destructive/5 flex flex-col gap-3 rounded-xl border p-4">
        <div>
          <p className="text-sm font-medium">Why is this application unsuccessful?</p>
          <p className="text-muted-foreground text-xs">
            This is sent to {applicantName}. A specific reason is far kinder than silence.
          </p>
        </div>
        <textarea
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="e.g. We've matched Luna with a home that has no other dogs, which suits her better."
          className="border-input focus-visible:ring-ring w-full rounded-lg border bg-transparent px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
        />
        {noteError ? (
          <p role="alert" className="text-destructive text-xs font-medium">
            {noteError}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button size="sm" variant="destructive" onClick={submitRejection} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : 'Send decision'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRejecting(false)} disabled={busy}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // Terminal states have no actions left.
  if (status === 'rejected' || status === 'withdrawn' || status === 'completed') return null;

  return (
    <div className="flex flex-wrap gap-2">
      {status === 'pending' ? (
        <Button size="sm" variant="outline" onClick={() => apply('under_review')} disabled={busy} className="gap-1.5">
          <Eye className="size-3.5" />
          Start review
        </Button>
      ) : null}

      {status === 'pending' || status === 'under_review' ? (
        <Button
          size="sm"
          onClick={() => apply('approved')}
          disabled={busy}
          className="bg-success gap-1.5 border-0 text-white hover:opacity-90"
        >
          {busy ? <Loader2 className="animate-spin" /> : <Check className="size-3.5" />}
          Approve
        </Button>
      ) : null}

      {status === 'approved' ? (
        <Button
          size="sm"
          onClick={() => apply('completed')}
          disabled={busy}
          className="bg-brand-gradient gap-1.5 border-0 text-white"
        >
          {busy ? <Loader2 className="animate-spin" /> : <Check className="size-3.5" />}
          Mark adopted
        </Button>
      ) : null}

      <Button
        size="sm"
        variant="outline"
        onClick={() => setRejecting(true)}
        disabled={busy}
        className="text-destructive hover:text-destructive gap-1.5"
      >
        <X className="size-3.5" />
        Decline
      </Button>
    </div>
  );
}
