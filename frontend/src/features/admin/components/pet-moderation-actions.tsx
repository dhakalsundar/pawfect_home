'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Star, StarOff, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { adminService } from '@/services/admin.service';
import { isApiError } from '@/services/api-error';
import type { PetStatus } from '@/types/pet';

export function PetModerationActions({
  petId,
  name,
  status,
  featured,
}: {
  petId: string;
  name: string;
  status: PetStatus;
  featured: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);

  async function run(action: 'approve' | 'reject' | 'feature' | 'unfeature', reason?: string) {
    setBusy(true);
    try {
      await adminService.moderatePet(petId, action, reason);
      const messages = {
        approve: `${name} approved and is now live.`,
        reject: `${name} rejected and archived.`,
        feature: `${name} is now featured on the home page.`,
        unfeature: `${name} is no longer featured.`,
      };
      toast.success(messages[action]);
      setRejecting(false);
      setNote('');
      router.refresh();
    } catch (error) {
      toast.error(isApiError(error) ? error.message : 'Could not moderate this listing.');
    } finally {
      setBusy(false);
    }
  }

  function submitRejection() {
    if (note.trim().length < 10) {
      setNoteError('Tell the shelter why (at least 10 characters).');
      return;
    }
    setNoteError(null);
    void run('reject', note.trim());
  }

  if (rejecting) {
    return (
      <div className="border-destructive/30 bg-destructive/5 mt-3 flex flex-col gap-3 rounded-xl border p-4">
        <div>
          <p className="text-sm font-medium">Why is this listing being rejected?</p>
          <p className="text-muted-foreground text-xs">
            The shelter sees this, so be specific enough that they can fix it.
          </p>
        </div>
        <textarea
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="e.g. The photos show a different animal to the one described."
          className="border-input focus-visible:ring-ring w-full rounded-lg border bg-transparent px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
        />
        {noteError ? (
          <p role="alert" className="text-destructive text-xs font-medium">
            {noteError}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button size="sm" variant="destructive" onClick={submitRejection} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : 'Reject listing'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRejecting(false)} disabled={busy}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === 'pending' ? (
        <>
          <Button
            size="sm"
            onClick={() => run('approve')}
            disabled={busy}
            className="bg-success gap-1.5 border-0 text-white hover:opacity-90"
          >
            {busy ? <Loader2 className="animate-spin" /> : <Check className="size-3.5" />}
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRejecting(true)}
            disabled={busy}
            className="text-destructive hover:text-destructive gap-1.5"
          >
            <X className="size-3.5" />
            Reject
          </Button>
        </>
      ) : null}

      {/* Only an available pet can be featured — the API enforces it, so don't offer it otherwise. */}
      {status === 'available' ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => run(featured ? 'unfeature' : 'feature')}
          disabled={busy}
          className="gap-1.5"
        >
          {busy ? (
            <Loader2 className="animate-spin" />
          ) : featured ? (
            <StarOff className="size-3.5" />
          ) : (
            <Star className="size-3.5" />
          )}
          {featured ? 'Unfeature' : 'Feature'}
        </Button>
      ) : null}
    </div>
  );
}
