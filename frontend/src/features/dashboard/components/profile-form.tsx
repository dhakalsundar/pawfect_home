'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { FormField } from '@/components/shared/form-field';
import { AvatarUpload } from './avatar-upload';
import { usersService } from '@/services/users.service';
import { useAuth } from '@/providers/auth-provider';
import { isApiError } from '@/services/api-error';
import type { User } from '@/types/auth';

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(60),
  phone: z.string().trim().max(24).optional(),
  bio: z.string().trim().max(500, 'Bio must be at most 500 characters.').optional(),
  street: z.string().trim().max(120).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  zip: z.string().trim().max(20).optional(),
  country: z.string().trim().max(80).optional(),
});

type ProfileValues = z.infer<typeof profileSchema>;

export function ProfileForm({ user }: { user: User }) {
  const router = useRouter();
  const { setUser } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user.name,
      phone: user.phone ?? '',
      bio: user.bio ?? '',
      street: '',
      city: '',
      state: '',
      zip: '',
      country: '',
    },
  });

  async function onSubmit(values: ProfileValues) {
    setFormError(null);
    try {
      const updated = await usersService.updateProfile({
        name: values.name,
        phone: values.phone,
        bio: values.bio,
        address: {
          street: values.street,
          city: values.city,
          state: values.state,
          zip: values.zip,
          country: values.country,
        },
      });

      // Update the client-side session so the navbar and sidebar reflect the new name at once,
      // then refresh so Server Components pick it up too.
      setUser(updated);
      reset(values);
      toast.success('Profile updated.');
      router.refresh();
    } catch (error) {
      if (isApiError(error)) {
        if (error.fields) {
          for (const [field, message] of Object.entries(error.fields)) {
            setError(field.split('.').pop() as keyof ProfileValues, { message });
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
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
      {formError ? (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      {/* Saves on its own rather than waiting for this form's Save — see the note in the component. */}
      <AvatarUpload user={user} />

      <Separator />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Full name"
          autoComplete="name"
          error={errors.name?.message}
          {...register('name')}
        />
        <FormField
          label="Phone"
          type="tel"
          autoComplete="tel"
          placeholder="Optional"
          error={errors.phone?.message}
          {...register('phone')}
        />
      </div>

      {/* Email is deliberately read-only: changing it needs re-verification, which is its own
          flow rather than a field in a profile form. */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Email</span>
        <div className="bg-muted/50 text-muted-foreground flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
          <span className="truncate">{user.email}</span>
          <span className="text-xs">
            {user.provider === 'google' ? 'Managed by Google' : 'Cannot be changed here'}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="bio" className="text-sm font-medium">
          About you
        </label>
        <textarea
          id="bio"
          rows={4}
          placeholder="Shelters see this on your applications. A sentence or two about your home is plenty."
          className="border-input focus-visible:ring-ring w-full rounded-lg border bg-transparent px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
          {...register('bio')}
        />
        {errors.bio ? (
          <p role="alert" className="text-destructive text-xs font-medium">
            {errors.bio.message}
          </p>
        ) : null}
      </div>

      <Separator />

      <div>
        <h2 className="mb-1 font-semibold">Location</h2>
        <p className="text-muted-foreground mb-4 text-sm">
          Used to show pets near you. Never shown publicly.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Street" placeholder="Optional" error={errors.street?.message} {...register('street')} />
          <FormField label="City" placeholder="Optional" error={errors.city?.message} {...register('city')} />
          <FormField label="State" placeholder="Optional" error={errors.state?.message} {...register('state')} />
          <FormField label="ZIP / Postcode" placeholder="Optional" error={errors.zip?.message} {...register('zip')} />
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={isSubmitting || !isDirty}
          className="bg-brand-gradient border-0 text-white"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" />
              Saving…
            </>
          ) : (
            'Save changes'
          )}
        </Button>
      </div>
    </form>
  );
}
