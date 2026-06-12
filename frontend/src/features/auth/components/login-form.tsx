'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { FormField } from '@/components/shared/form-field';
import { GoogleButton } from './google-button';
import { CaptchaField } from './captcha-field';
import { TwoFactorForm } from './two-factor-form';
import { MagicLinkForm } from './magic-link-form';
import { useCaptcha } from '../hooks/use-captcha';
import { useAuth } from '@/providers/auth-provider';
import { isApiError } from '@/services/api-error';
import { isTwoFactorRequired } from '@/services/auth.service';
import { ErrorCode } from '@/types/api';
import { loginFormSchema, type LoginFormValues } from '@/lib/validation/auth';

/** Only same-origin relative paths — otherwise ?callbackUrl= is an open redirect. */
function safeCallback(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/dashboard';
  return raw;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [twoFactorStep, setTwoFactorStep] = useState(false);
  const [magicMode, setMagicMode] = useState(false);
  const captcha = useCaptcha();

  const callbackUrl = safeCallback(searchParams.get('callbackUrl'));
  // The Google callback redirects here with ?error= when the OAuth flow fails.
  const oauthError = searchParams.get('error');

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: LoginFormValues) {
    setFormError(null);
    try {
      const result = await login(values.email, values.password, captcha.payload());
      captcha.reset();
      // Password accepted but a second factor is due — swap to the code step.
      if (isTwoFactorRequired(result)) {
        setTwoFactorStep(true);
        return;
      }
      router.push(callbackUrl);
    } catch (error) {
      if (isApiError(error)) {
        // The API is now demanding a challenge — show one and stop.
        if (error.code === ErrorCode.CAPTCHA_REQUIRED) {
          await captcha.activate();
          setFormError(error.message);
          return;
        }
        // A single-use token was just spent (locked, wrong password, etc.) — get a fresh one so
        // the next attempt is not doomed to fail on a stale challenge.
        if (captcha.required) await captcha.refresh();

        // Locked: show the countdown message as a banner.
        if (error.code === ErrorCode.ACCOUNT_LOCKED) {
          setFormError(error.message);
          return;
        }
        // Field-level errors from the API attach to their inputs; anything else is a banner.
        if (error.fields && Object.keys(error.fields).length > 0) {
          for (const [field, message] of Object.entries(error.fields)) {
            setError(field as keyof LoginFormValues, { message });
          }
          return;
        }
        setFormError(error.message);
        return;
      }
      setFormError('Something went wrong. Please try again.');
    }
  }

  if (twoFactorStep) {
    return (
      <div className="bg-card shadow-lift rounded-2xl border p-6 sm:p-8">
        <div className="mb-6 space-y-1.5">
          <h1 className="text-2xl font-bold">Verify it&rsquo;s you</h1>
          <p className="text-muted-foreground text-sm">
            Your account has two-factor authentication enabled.
          </p>
        </div>
        <TwoFactorForm callbackUrl={callbackUrl} onCancel={() => setTwoFactorStep(false)} />
      </div>
    );
  }

  if (magicMode) {
    return (
      <div className="bg-card shadow-lift rounded-2xl border p-6 sm:p-8">
        <div className="mb-6 space-y-1.5">
          <h1 className="text-2xl font-bold">Passwordless sign in</h1>
          <p className="text-muted-foreground text-sm">Get a one-time link sent to your inbox.</p>
        </div>
        <MagicLinkForm onBack={() => setMagicMode(false)} />
      </div>
    );
  }

  return (
    <div className="bg-card shadow-lift rounded-2xl border p-6 sm:p-8">
      <div className="mb-6 space-y-1.5">
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="text-muted-foreground text-sm">Sign in to continue your adoption journey.</p>
      </div>

      {formError || oauthError ? (
        <Alert variant="destructive" className="mb-5">
          <TriangleAlert className="size-4" />
          <AlertDescription>{formError ?? oauthError}</AlertDescription>
        </Alert>
      ) : null}

      <GoogleButton callbackUrl={callbackUrl} label="Sign in with Google" />

      <div className="my-5 flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-muted-foreground text-xs">or</span>
        <Separator className="flex-1" />
      </div>

      {/* noValidate hands validation to zod — browser bubbles cannot be styled or announced well. */}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <FormField
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register('email')}
        />

        <div className="flex flex-col gap-1.5">
          <FormField
            label="Password"
            revealable
            autoComplete="current-password"
            placeholder="••••••••"
            error={errors.password?.message}
            {...register('password')}
          />
          <Link
            href="/forgot-password"
            className="text-primary-strong self-end text-xs font-medium hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        {captcha.required ? (
          <CaptchaField
            challenge={captcha.challenge}
            answer={captcha.answer}
            loading={captcha.loading}
            onAnswerChange={captcha.setAnswer}
            onRefresh={captcha.refresh}
          />
        ) : null}

        <Button
          type="submit"
          disabled={isSubmitting}
          className="bg-brand-gradient hover:shadow-glow mt-1 w-full border-0 text-white transition-shadow"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" />
              Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </Button>
      </form>

      <button
        type="button"
        onClick={() => setMagicMode(true)}
        className="text-primary-strong mt-4 w-full text-center text-sm font-medium hover:underline"
      >
        Email me a sign-in link instead
      </button>

      <p className="text-muted-foreground mt-6 text-center text-sm">
        New to PawfectHome?{' '}
        <Link href="/register" className="text-primary-strong font-medium hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
