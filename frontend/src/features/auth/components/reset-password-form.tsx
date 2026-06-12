'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Loader2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FormField } from '@/components/shared/form-field';
import { authService } from '@/services/auth.service';
import { isApiError } from '@/services/api-error';
import { resetPasswordFormSchema, type ResetPasswordFormValues } from '@/lib/validation/auth';

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  async function onSubmit(values: ResetPasswordFormValues) {
    if (!token) return;
    setFormError(null);
    try {
      await authService.resetPassword(token, values.password);
      setDone(true);
      toast.success('Password updated. Please sign in.');
      // Resetting revokes every session, including this browser's, so login is the only next step.
      setTimeout(() => router.push('/login'), 1800);
    } catch (error) {
      setFormError(
        isApiError(error) ? error.message : 'Something went wrong. Please try again.',
      );
    }
  }

  // A link without a token is a broken link — say so rather than showing an unusable form.
  if (!token) {
    return (
      <div className="bg-card shadow-lift rounded-2xl border p-6 text-center sm:p-8">
        <span className="bg-destructive/10 text-destructive mx-auto mb-4 grid size-14 place-items-center rounded-2xl">
          <TriangleAlert className="size-7" />
        </span>
        <h1 className="mb-2 text-2xl font-bold">Invalid reset link</h1>
        <p className="text-muted-foreground text-sm">
          This link is missing its token. Request a new one and use the most recent email.
        </p>
        <Button asChild className="bg-brand-gradient mt-6 w-full border-0 text-white">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="bg-card shadow-lift rounded-2xl border p-6 text-center sm:p-8">
        <span className="bg-success/10 text-success mx-auto mb-4 grid size-14 place-items-center rounded-2xl">
          <CheckCircle2 className="size-7" />
        </span>
        <h1 className="mb-2 text-2xl font-bold">Password updated</h1>
        <p className="text-muted-foreground text-sm">
          You&apos;ve been signed out everywhere for security. Redirecting you to sign in…
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card shadow-lift rounded-2xl border p-6 sm:p-8">
      <div className="mb-6 space-y-1.5">
        <h1 className="text-2xl font-bold">Choose a new password</h1>
        <p className="text-muted-foreground text-sm">
          This signs you out on all devices.
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
          label="New password"
          revealable
          autoComplete="new-password"
          placeholder="••••••••"
          error={errors.password?.message}
          hint="At least 8 characters, with upper and lowercase letters and a number."
          {...register('password')}
        />

        <FormField
          label="Confirm new password"
          revealable
          autoComplete="new-password"
          placeholder="••••••••"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <Button
          type="submit"
          disabled={isSubmitting}
          className="bg-brand-gradient w-full border-0 text-white"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" />
              Updating…
            </>
          ) : (
            'Update password'
          )}
        </Button>
      </form>
    </div>
  );
}
