'use client';

import { useSearchParams } from 'next/navigation';
import { TwoFactorForm } from './two-factor-form';

/** Only same-origin relative paths — otherwise ?callbackUrl= is an open redirect. */
function safeCallback(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/dashboard';
  return raw;
}

export function TwoFactorStep() {
  const searchParams = useSearchParams();
  const callbackUrl = safeCallback(searchParams.get('callbackUrl'));

  return (
    <div className="bg-card shadow-lift rounded-2xl border p-6 sm:p-8">
      <div className="mb-6 space-y-1.5">
        <h1 className="text-2xl font-bold">Verify it&rsquo;s you</h1>
        <p className="text-muted-foreground text-sm">
          Your account has two-factor authentication enabled.
        </p>
      </div>
      <TwoFactorForm callbackUrl={callbackUrl} />
    </div>
  );
}
