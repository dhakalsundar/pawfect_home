'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { adminService } from '@/services/admin.service';
import { isApiError } from '@/services/api-error';

type Decision = 'rejected' | 'suspended';

export function ShelterActions({
  shelterId,
  name,
  status,
}: {
  shelterId: string;
  name: string;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);

  async function approve() {
    setBusy(true);
    try {
      await adminService.reviewShelter(shelterId, 'approved');
      toast.success(`${name} approved. Their owner now has shelter access.`);
      router.refresh();
    } catch (error) {
      toast.error(isApiError(error) ? error.message : 'Could not approve.');
    } finally {
      setBusy(false);
    }
  }

  async function submitDecision() {
    if (!decision) return;
    // The API enforces this too; checking here saves a round trip.
    if (reason.trim().length < 10) {
      setReasonError('Please give a reason (at least 10 characters).');
      return;
    }
    setReasonError(null);
    setBusy(true);
    try {
      await adminService.reviewShelter(shelterId, decision, reason.trim());
      toast.success(`${name} ${decision}.`);
      setDecision(null);
      setReason('');
      router.refresh();
    } catch (error) {
      toast.error(isApiError(error) ? error.message : 'Could not update.');
    } finally {
      setBusy(false);
    }
  }

  if (decision) {
    return (
      <div className="border-destructive/30 bg-destructive/5 mt-3 flex flex-col gap-3 rounded-xl border p-4">
        <div>
          <p className="text-sm font-medium">
            Why is {name} being {decision}?
          </p>
          <p className="text-muted-foreground text-xs">
            {decision === 'suspended'
              ? 'Their available and pending listings will be archived.'
              : 'This is recorded on their application.'}
          </p>
        </div>
        <textarea
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="e.g. Registration number could not be verified with the state registry."
          className="border-input focus-visible:ring-ring w-full rounded-lg border bg-transparent px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
        />
        {reasonError ? (
          <p role="alert" className="text-destructive text-xs font-medium">
            {reasonError}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button size="sm" variant="destructive" onClick={submitDecision} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : 'Confirm'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDecision(null)} disabled={busy}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {status !== 'approved' ? (
        <Button
          size="sm"
          onClick={approve}
          disabled={busy}
          className="bg-success gap-1.5 border-0 text-white hover:opacity-90"
        >
          {busy ? <Loader2 className="animate-spin" /> : <Check className="size-3.5" />}
          Approve
        </Button>
      ) : null}

      {status === 'pending' ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setDecision('rejected')}
          disabled={busy}
          className="text-destructive hover:text-destructive gap-1.5"
        >
          <X className="size-3.5" />
          Reject
        </Button>
      ) : null}

      {status === 'approved' ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setDecision('suspended')}
          disabled={busy}
          className="text-destructive hover:text-destructive gap-1.5"
        >
          <Ban className="size-3.5" />
          Suspend
        </Button>
      ) : null}
    </div>
  );
}
