'use client';

import { useId } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CaptchaChallenge } from '@/services/auth.service';

interface CaptchaFieldProps {
  challenge: CaptchaChallenge | null;
  answer: string;
  loading: boolean;
  onAnswerChange: (value: string) => void;
  onRefresh: () => void;
}

/**
 * The verification challenge shown after repeated failures. The image is a server-signed data-URI
 * SVG rendered through <img>, so its markup is inert — a deliberate XSS-safety choice (an inline
 * SVG could carry a script; an <img> source cannot execute one).
 */
export function CaptchaField({
  challenge,
  answer,
  loading,
  onAnswerChange,
  onRefresh,
}: CaptchaFieldProps) {
  const id = useId();

  return (
    <div className="border-primary/30 bg-brand-50/40 flex flex-col gap-2 rounded-xl border border-dashed p-3">
      <div className="text-primary-strong flex items-center gap-1.5 text-xs font-medium">
        <ShieldCheck className="size-3.5" />
        Verify you&rsquo;re human
      </div>

      <div className="flex items-center gap-2">
        <div className="bg-background grid h-14 w-40 shrink-0 place-items-center overflow-hidden rounded-lg border">
          {challenge ? (
            // eslint-disable-next-line @next/next/no-img-element -- data: URI, not a remote asset
            <img
              src={challenge.image}
              alt="Verification challenge"
              width={160}
              height={56}
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="text-muted-foreground text-xs">Loading…</span>
          )}
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Get a new challenge"
          className="text-muted-foreground hover:text-foreground hover:bg-muted grid size-9 shrink-0 place-items-center rounded-lg border transition-colors disabled:opacity-50"
        >
          <RefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} />
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id} className="sr-only">
          Enter the characters shown
        </Label>
        <Input
          id={id}
          value={answer}
          onChange={(event) => onAnswerChange(event.target.value)}
          placeholder="Enter the characters above"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="tracking-widest uppercase"
        />
      </div>
    </div>
  );
}
