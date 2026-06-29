'use client';

import { useState } from 'react';
import { Check, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

/**
 * Uses the native share sheet where available (mobile, Safari), falling back to copying the link.
 *
 * navigator.share only exists in a secure context and must be called from a user gesture, so it is
 * feature-detected at click time rather than on mount.
 */
export function ShareButton({ petName, title }: { petName: string; title: string }) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = window.location.href;

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text: `Meet ${petName} on PawfectHome`, url });
        return;
      } catch (error) {
        // Dismissing the share sheet rejects with AbortError — that is a choice, not a failure,
        // so it must not fall through to copying the link behind the user's back.
        if (error instanceof Error && error.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy the link. You can copy it from the address bar.');
    }
  }

  return (
    <Button variant="outline" onClick={handleShare} className="gap-2">
      {copied ? <Check className="size-4" /> : <Share2 className="size-4" />}
      {copied ? 'Copied' : 'Share'}
    </Button>
  );
}
