'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { donationsService } from '@/services/donations.service';

/**
 * Confirms a cash-on-delivery pledge as received. The server is idempotent, so a double-click can
 * never count the money twice; the button just reflects the request in flight.
 */
export function MarkReceivedButton({ donationId }: { donationId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      await donationsService.markReceived(donationId);
      toast.success('Marked as received. Thank you for confirming.');
      router.refresh();
    } catch {
      toast.error('Could not update that pledge. Please try again.');
      setPending(false);
    }
  }

  return (
    <Button
      size="sm"
      onClick={() => void handleClick()}
      disabled={pending}
      className="gap-1.5 rounded-2xl"
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <Check className="size-3.5" aria-hidden />
      )}
      Mark received
    </Button>
  );
}
