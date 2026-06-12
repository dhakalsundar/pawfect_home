'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-provider';
import { isTwoFactorRequired } from '@/services/auth.service';
import { isApiError } from '@/services/api-error';

function safeCallback(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/dashboard';
  return raw;
}

export function MagicLinkVerify() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { completeMagicLink } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  const token = searchParams.get('token');
  const callbackUrl = safeCallback(searchParams.get('callbackUrl'));

  useEffect(() => {
    if (ran.current || !token) return; // consume the single-use token exactly once
    ran.current = true;

    completeMagicLink(token)
      .then((result) => {
        if (isTwoFactorRequired(result)) {
          router.replace(`/login/2fa?callbackUrl=${encodeURIComponent(callbackUrl)}`);
        } else {
          router.replace(callbackUrl);
          router.refresh();
        }
      })
      .catch((err) => {
        setError(
          isApiError(err)
            ? err.message
            : 'This sign-in link is invalid or has expired.',
        );
      });
  }, [token, callbackUrl, completeMagicLink, router]);

  const displayError = error ?? (!token ? 'This sign-in link is missing its token.' : null);

  return (
    <div className="bg-card shadow-lift rounded-2xl border p-6 sm:p-8">
      {displayError ? (
        <div className="flex flex-col gap-4">
          <Alert variant="destructive">
            <TriangleAlert className="size-4" />
            <AlertDescription>{displayError}</AlertDescription>
          </Alert>
          <Button asChild className="bg-brand-gradient border-0 text-white">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Loader2 className="text-primary size-8 animate-spin" />
          <p className="text-muted-foreground text-sm">Signing you in…</p>
        </div>
      )}
    </div>
  );
}
