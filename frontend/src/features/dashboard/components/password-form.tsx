'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Info, Loader2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FormField } from '@/components/shared/form-field';
import { authService } from '@/services/auth.service';
import { isApiError } from '@/services/api-error';
import { passwordSchema } from '@/lib/validation/auth';
import type { User } from '@/types/auth';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm your new password.'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: 'Your new password must be different from the current one.',
    path: ['newPassword'],
  });

type Values = z.infer<typeof schema>;

export function PasswordForm({ user }: { user: User }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  // A Google account has no password on this system; offering the form would be a dead end.
  if (user.provider === 'google') {
    return (
      <Alert>
        <Info className="size-4" />
        <AlertDescription>
          You sign in with Google, so there is no PawfectHome password to change. Manage your
          password in your Google account.
        </AlertDescription>
      </Alert>
    );
  }

  async function onSubmit(values: Values) {
    setFormError(null);
    try {
      await authService.changePassword(values.currentPassword, values.newPassword);
      toast.success('Password changed. Please sign in again.');
      // The API revokes every session, including this one, so login is the only way forward.
      router.push('/login');
    } catch (error) {
      if (isApiError(error)) {
        if (error.fields) {
          for (const [field, message] of Object.entries(error.fields)) {
            setError(field as keyof Values, { message });
          }
          return;
        }
        setFormError(error.message);
        return;
      }
      setFormError('Something went wrong. Please try again.');
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex max-w-md flex-col gap-4">
      {formError ? (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <FormField
        label="Current password"
        revealable
        autoComplete="current-password"
        error={errors.currentPassword?.message}
        {...register('currentPassword')}
      />
      <FormField
        label="New password"
        revealable
        autoComplete="new-password"
        hint="At least 8 characters, with upper and lowercase letters and a number."
        error={errors.newPassword?.message}
        {...register('newPassword')}
      />
      <FormField
        label="Confirm new password"
        revealable
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register('confirmPassword')}
      />

      <p className="text-muted-foreground text-xs">
        Changing your password signs you out on every device.
      </p>

      <Button
        type="submit"
        disabled={isSubmitting}
        className="bg-brand-gradient self-start border-0 text-white"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="animate-spin" />
            Updating…
          </>
        ) : (
          'Change password'
        )}
      </Button>
    </form>
  );
}
