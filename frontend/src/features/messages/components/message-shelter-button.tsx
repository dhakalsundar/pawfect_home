'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-provider';
import { messagesService } from '@/services/messages.service';

/**
 * Opens (or reopens) the conversation with this pet's shelter.
 *
 * The API resolves the recipient from the pet and returns the existing thread if there is one, so
 * clicking twice can never split the history — the button does not need to know either fact.
 */
export function MessageShelterButton({ petId }: { petId: string }) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (!isAuthenticated) {
      // Come back to this pet after signing in rather than dumping them on the dashboard.
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    setPending(true);
    try {
      const conversation = await messagesService.start({ petId });
      router.push(`/dashboard/messages?c=${conversation.id}`);
    } catch {
      toast.error('Could not open that conversation. Please try again.');
      setPending(false);
    }
  }

  return (
    <Button
      variant="outline"
      className="mt-4 w-full gap-2"
      onClick={() => void handleClick()}
      disabled={pending}
    >
      <MessageCircle className="size-4" />
      {pending ? 'Opening…' : 'Message shelter'}
    </Button>
  );
}
