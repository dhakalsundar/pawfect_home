'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldCheck, ShieldOff, Copy, Check, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FormField } from '@/components/shared/form-field';
import { authService, type TwoFactorSetup } from '@/services/auth.service';
import { isApiError } from '@/services/api-error';
import type { User } from '@/types/auth';

type Mode = 'idle' | 'enrolling' | 'backup' | 'disabling';

export function TwoFactorSettings({ user }: { user: User }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(user.twoFactorEnabled);
  const [mode, setMode] = useState<Mode>('idle');
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function reset() {
    setMode('idle');
    setSetup(null);
    setCode('');
    setError(null);
  }

  async function beginSetup() {
    setError(null);
    setLoading(true);
    try {
      setSetup(await authService.twoFactorSetup());
      setMode('enrolling');
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Could not start setup. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function confirmEnable(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { backupCodes: codes } = await authService.twoFactorEnable(code.trim());
      setBackupCodes(codes);
      setEnabled(true);
      setMode('backup');
      setCode('');
      router.refresh();
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Could not enable. Check the code and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function confirmDisable(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authService.twoFactorDisable(code.trim());
      setEnabled(false);
      toast.success('Two-factor authentication disabled.');
      reset();
      router.refresh();
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Could not disable. Check the code and try again.');
    } finally {
      setLoading(false);
    }
  }

  function copyBackupCodes() {
    void navigator.clipboard.writeText(backupCodes.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // --- Backup-codes screen (shown once, right after enabling) ---
  if (mode === 'backup') {
    return (
      <div className="flex max-w-md flex-col gap-4">
        <Alert>
          <ShieldCheck className="size-4" />
          <AlertDescription>
            Two-factor authentication is on. Save these backup codes somewhere safe — each works
            once if you lose your authenticator. They won&rsquo;t be shown again.
          </AlertDescription>
        </Alert>
        <ul className="bg-muted/50 grid grid-cols-2 gap-2 rounded-xl border p-4 font-mono text-sm">
          {backupCodes.map((c) => (
            <li key={c} className="tracking-widest">
              {c}
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={copyBackupCodes} className="gap-1.5">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? 'Copied' : 'Copy codes'}
          </Button>
          <Button
            type="button"
            onClick={() => {
              setBackupCodes([]);
              reset();
            }}
            className="bg-brand-gradient border-0 text-white"
          >
            I&rsquo;ve saved them
          </Button>
        </div>
      </div>
    );
  }

  // --- Enrolment screen (QR + confirm code) ---
  if (mode === 'enrolling' && setup) {
    return (
      <form onSubmit={confirmEnable} noValidate className="flex max-w-md flex-col gap-4">
        {error ? (
          <Alert variant="destructive">
            <TriangleAlert className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <p className="text-muted-foreground text-sm">
          Scan this QR code with an authenticator app (Google Authenticator, Authy, 1Password), then
          enter the 6-digit code it shows.
        </p>
        <div className="bg-background w-fit self-center rounded-xl border p-3">
          <Image
            src={setup.qrDataUri}
            alt="Two-factor QR code"
            width={200}
            height={200}
            unoptimized
          />
        </div>
        <p className="text-muted-foreground text-center text-xs">
          Can&rsquo;t scan? Enter this key manually:
          <br />
          <span className="text-foreground font-mono tracking-wider break-all select-all">
            {setup.secret}
          </span>
        </p>
        <FormField
          label="6-digit code"
          name="code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          className="tracking-[0.3em]"
        />
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={reset} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={loading || code.trim().length < 6}
            className="bg-brand-gradient border-0 text-white"
          >
            {loading ? <Loader2 className="animate-spin" /> : null}
            Verify &amp; enable
          </Button>
        </div>
      </form>
    );
  }

  // --- Disable screen (requires a current code) ---
  if (mode === 'disabling') {
    return (
      <form onSubmit={confirmDisable} noValidate className="flex max-w-md flex-col gap-4">
        {error ? (
          <Alert variant="destructive">
            <TriangleAlert className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <p className="text-muted-foreground text-sm">
          Enter a current authenticator code (or a backup code) to turn off two-factor
          authentication.
        </p>
        <FormField
          label="Code"
          name="code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="one-time-code"
          placeholder="123456"
          className="tracking-[0.3em]"
        />
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={reset} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="destructive" disabled={loading || code.trim().length < 6}>
            {loading ? <Loader2 className="animate-spin" /> : null}
            Disable
          </Button>
        </div>
      </form>
    );
  }

  // --- Idle state ---
  return (
    <div className="flex max-w-md flex-col gap-4">
      {error ? (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex items-center gap-2">
        {enabled ? (
          <Badge className="bg-success/10 text-success gap-1.5 border-0">
            <ShieldCheck className="size-3.5" />
            Enabled
          </Badge>
        ) : (
          <Badge variant="secondary" className="gap-1.5">
            <ShieldOff className="size-3.5" />
            Not enabled
          </Badge>
        )}
      </div>

      {enabled ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setMode('disabling');
            setError(null);
          }}
          className="self-start"
        >
          Disable two-factor authentication
        </Button>
      ) : (
        <Button
          type="button"
          onClick={beginSetup}
          disabled={loading}
          className="bg-brand-gradient self-start border-0 text-white"
        >
          {loading ? <Loader2 className="animate-spin" /> : <ShieldCheck className="size-4" />}
          Set up two-factor authentication
        </Button>
      )}
    </div>
  );
}
