'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { adoptionsService } from '@/services/adoptions.service';
import { isApiError } from '@/services/api-error';

export function WithdrawButton({ applicationId, petName }: { applicationId: string; petName: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function withdraw() {
    setBusy(true);
    try {
      await adoptionsService.withdraw(applicationId, reason.trim() || undefined);
      toast.success('Application withdrawn.');
      setConfirming(false);
      // Server Components hold the old status; refresh re-renders them with the new one.
      router.refresh();
    } catch (error) {
      toast.error(isApiError(error) ? error.message : 'Could not withdraw. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <Button variant="outline" onClick={() => setConfirming(true)} className="gap-2">
        <XCircle className="size-4" />
        Withdraw application
      </Button>
    );
  }

  return (
    <div className="border-destructive/30 bg-destructive/5 flex flex-col gap-3 rounded-xl border p-4">
      <div>
        <p className="font-medium">Withdraw your application for {petName}?</p>
        <p className="text-muted-foreground text-sm">
          The shelter will be notified. You can apply again later if you change your mind.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="withdraw-reason" className="text-sm font-medium">
          Reason (optional)
        </label>
        <textarea
          id="withdraw-reason"
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Anything you'd like the shelter to know."
          className="border-input focus-visible:ring-ring w-full rounded-lg border bg-transparent px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
        />
      </div>

      <div className="flex gap-2">
        <Button variant="destructive" onClick={withdraw} disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="animate-spin" />
              Withdrawing…
            </>
          ) : (
            'Yes, withdraw'
          )}
        </Button>
        <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
          Keep it
        </Button>
      </div>
    </div>
  );
}
