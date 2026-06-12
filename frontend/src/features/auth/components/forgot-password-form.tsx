'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2, MailCheck, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FormField } from '@/components/shared/form-field';
import { authService } from '@/services/auth.service';
import { isApiError } from '@/services/api-error';
import {
  forgotPasswordFormSchema,
  type ForgotPasswordFormValues,
} from '@/lib/validation/auth';

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordFormSchema),
    defaultValues: { email: '' },
  });

  async function onSubmit(values: ForgotPasswordFormValues) {
    setFormError(null);
    try {
      await authService.forgotPassword(values.email);
      setSentTo(values.email);
    } catch (error) {
      // The API returns 200 whether or not the account exists, so reaching here means a genuine
      // failure — a network problem or the rate limiter — not "no such user".
      setFormError(
        isApiError(error) ? error.message : 'Something went wrong. Please try again.',
      );
    }
  }

  if (sentTo) {
    return (
      <div className="bg-card shadow-lift rounded-2xl border p-6 text-center sm:p-8">
        <span className="bg-success/10 text-success mx-auto mb-4 grid size-14 place-items-center rounded-2xl">
          <MailCheck className="size-7" />
        </span>
        <h1 className="mb-2 text-2xl font-bold">Check your inbox</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          If an account exists for <span className="text-foreground font-medium">{sentTo}</span>,
          we&apos;ve sent a link to reset your password. It expires in 1 hour.
        </p>
        <p className="text-muted-foreground mt-4 text-xs">
          Nothing arrived? Check your spam folder, or try again in a few minutes.
        </p>
        <Button asChild variant="outline" className="mt-6 w-full">
          <Link href="/login">
            <ArrowLeft />
            Back to sign in
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-card shadow-lift rounded-2xl border p-6 sm:p-8">
      <div className="mb-6 space-y-1.5">
        <h1 className="text-2xl font-bold">Forgot your password?</h1>
        <p className="text-muted-foreground text-sm">
          Enter your email and we&apos;ll send you a link to reset it.
        </p>
      </div>

      {formError ? (
        <Alert variant="destructive" className="mb-5">
          <TriangleAlert className="size-4" />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <FormField
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register('email')}
        />

        <Button
          type="submit"
          disabled={isSubmitting}
          className="bg-brand-gradient w-full border-0 text-white"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" />
              Sending…
            </>
          ) : (
            'Send reset link'
          )}
        </Button>
      </form>

      <Button asChild variant="ghost" className="mt-4 w-full">
        <Link href="/login">
          <ArrowLeft />
          Back to sign in
        </Link>
      </Button>
    </div>
  );
}
