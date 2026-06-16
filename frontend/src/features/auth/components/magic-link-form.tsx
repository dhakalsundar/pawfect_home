'use client';

import { useState } from 'react';
import { Loader2, Mail, MailCheck, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FormField } from '@/components/shared/form-field';
import { authService } from '@/services/auth.service';
import { isApiError } from '@/services/api-error';

/** The passwordless request step: enter an email, receive a one-time sign-in link. */
export function MagicLinkForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await authService.requestMagicLink(email.trim());
      setSent(true);
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <Alert>
          <MailCheck className="size-4" />
          <AlertDescription>
            If an account exists for <strong>{email}</strong>, a one-time sign-in link is on its way.
            It expires in 15 minutes.
          </AlertDescription>
        </Alert>
        <Button type="button" variant="outline" onClick={onBack} className="self-start">
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        We&rsquo;ll email you a secure link to sign in — no password needed.
      </p>

      {error ? (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <FormField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />

      <Button
        type="submit"
        disabled={submitting || email.trim().length < 3}
        className="bg-brand-gradient hover:shadow-glow w-full gap-1.5 border-0 text-white transition-shadow"
      >
        {submitting ? <Loader2 className="animate-spin" /> : <Mail className="size-4" />}
        Email me a sign-in link
      </Button>

      <button
        type="button"
        onClick={onBack}
        className="text-muted-foreground hover:text-foreground text-center text-xs"
      >
        Back to password sign in
      </button>
    </form>
  );
}
