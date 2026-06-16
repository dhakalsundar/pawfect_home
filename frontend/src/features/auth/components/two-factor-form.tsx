'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FormField } from '@/components/shared/form-field';
import { useAuth } from '@/providers/auth-provider';
import { isApiError } from '@/services/api-error';

/**
 * The second step of a 2FA login. Rendered inline by the login form after a password succeeds, and
 * standalone at /login/2fa when Google OAuth redirects a 2FA-enabled account here. The pending-2FA
 * cookie set by the API travels automatically, so this component only needs the code.
 */
export function TwoFactorForm({
  callbackUrl,
  onCancel,
}: {
  callbackUrl: string;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const { completeTwoFactor } = useAuth();
  const [code, setCode] = useState('');
  const [useBackup, setUseBackup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await completeTwoFactor(code.trim());
      router.push(callbackUrl);
      router.refresh();
    } catch (err) {
      setError(
        isApiError(err) ? err.message : 'Something went wrong. Please try again.',
      );
      setCode('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="text-primary-strong flex items-center gap-2 text-sm font-medium">
        <ShieldCheck className="size-4" />
        Two-factor verification
      </div>
      <p className="text-muted-foreground text-sm">
        {useBackup
          ? 'Enter one of the backup codes you saved when you set up two-factor authentication.'
          : 'Enter the 6-digit code from your authenticator app.'}
      </p>

      {error ? (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <FormField
        label={useBackup ? 'Backup code' : 'Authentication code'}
        value={code}
        onChange={(event) => setCode(event.target.value)}
        inputMode={useBackup ? 'text' : 'numeric'}
        autoComplete="one-time-code"
        autoFocus
        placeholder={useBackup ? 'XXXX-XXXX' : '123456'}
        className="tracking-[0.3em]"
        // name is required by FormField's input spread
        name="code"
      />

      <Button
        type="submit"
        disabled={submitting || code.trim().length < 6}
        className="bg-brand-gradient hover:shadow-glow w-full border-0 text-white transition-shadow"
      >
        {submitting ? (
          <>
            <Loader2 className="animate-spin" />
            Verifying…
          </>
        ) : (
          'Verify'
        )}
      </Button>

      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={() => {
            setUseBackup((v) => !v);
            setCode('');
            setError(null);
          }}
          className="text-primary-strong font-medium hover:underline"
        >
          {useBackup ? 'Use authenticator app instead' : 'Use a backup code'}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="text-muted-foreground hover:text-foreground"
          >
            Back
          </button>
        ) : null}
      </div>
    </form>
  );
}
