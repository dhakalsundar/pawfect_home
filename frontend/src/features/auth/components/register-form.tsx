'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, TriangleAlert, Check, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { FormField } from '@/components/shared/form-field';
import { GoogleButton } from './google-button';
import { CaptchaField } from './captcha-field';
import { useCaptcha } from '../hooks/use-captcha';
import { useAuth } from '@/providers/auth-provider';
import { isApiError } from '@/services/api-error';
import { ErrorCode } from '@/types/api';
import {
  passwordStrength,
  registerFormSchema,
  type RegisterFormValues,
} from '@/lib/validation/auth';
import { cn } from '@/lib/utils';

const STRENGTH_STYLES = [
  'bg-muted',
  'bg-destructive',
  'bg-warning',
  'bg-amber-brand',
  'bg-success',
] as const;

function Requirement({ met, children }: { met: boolean; children: React.ReactNode }) {
  return (
    <li className={cn('flex items-center gap-1', met ? 'text-success' : 'text-muted-foreground')}>
      {met ? <Check className="size-3" /> : <Circle className="size-3" />}
      {children}
    </li>
  );
}

function StrengthMeter({ value }: { value: string }) {
  const { score, label, checks, feedback } = passwordStrength(value);
  if (!value) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((level) => (
          <span
            key={level}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-300',
              level <= score ? STRENGTH_STYLES[score] : 'bg-muted',
            )}
          />
        ))}
      </div>
      {/* aria-live so the strength change is announced without stealing focus. */}
      <p className="text-muted-foreground text-xs" aria-live="polite">
        Password strength: <span className="font-medium">{label}</span>
      </p>
      {feedback ? (
        <p className="text-muted-foreground text-xs" aria-live="polite">
          {feedback}
        </p>
      ) : null}
      <ul className="text-xs" aria-label="Password requirements">
        <Requirement met={checks.length}>At least 8 characters</Requirement>
        <Requirement met={checks.cases}>Upper &amp; lowercase letters</Requirement>
        <Requirement met={checks.number}>A number</Requirement>
        <Requirement met={checks.symbol}>A symbol (recommended)</Requirement>
      </ul>
    </div>
  );
}

function safeCallback(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/dashboard';
  return raw;
}

export function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { register: registerUser } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const captcha = useCaptcha();

  const callbackUrl = safeCallback(searchParams.get('callbackUrl'));

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    // onBlur rather than onChange: validating mid-typing flags "too short" on the first keystroke,
    // which reads as the form scolding you for not having finished yet.
    mode: 'onBlur',
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      acceptTerms: false as never,
    },
  });

  // useWatch rather than the destructured watch(): watch returns a fresh function each render,
  // which the React Compiler cannot memoize, so it bails out of optimising the whole component.
  const password = useWatch({ control, name: 'password' });
  const acceptTerms = useWatch({ control, name: 'acceptTerms' });

  async function onSubmit(values: RegisterFormValues) {
    setFormError(null);
    try {
      await registerUser(values.name, values.email, values.password, captcha.payload());
      captcha.reset();
      router.push(callbackUrl);
    } catch (error) {
      if (isApiError(error)) {
        if (error.code === ErrorCode.CAPTCHA_REQUIRED) {
          await captcha.activate();
          setFormError(error.message);
          return;
        }
        if (captcha.required) await captcha.refresh();

        // A duplicate email is a field problem, not a banner — put it where the user can fix it.
        if (error.status === 409) {
          setError('email', { message: error.message });
          return;
        }
        if (error.fields && Object.keys(error.fields).length > 0) {
          for (const [field, message] of Object.entries(error.fields)) {
            setError(field as keyof RegisterFormValues, { message });
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
    <div className="bg-card shadow-lift rounded-2xl border p-6 sm:p-8">
      <div className="mb-6 space-y-1.5">
        <h1 className="text-2xl font-bold">Create your account</h1>
        <p className="text-muted-foreground text-sm">
          Save favourites, apply to adopt, and message shelters.
        </p>
      </div>

      {formError ? (
        <Alert variant="destructive" className="mb-5">
          <TriangleAlert className="size-4" />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <GoogleButton callbackUrl={callbackUrl} label="Sign up with Google" />

      <div className="my-5 flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-muted-foreground text-xs">or</span>
        <Separator className="flex-1" />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <FormField
          label="Full name"
          autoComplete="name"
          placeholder="Jane Doe"
          error={errors.name?.message}
          {...register('name')}
        />

        <FormField
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register('email')}
        />

        <div className="flex flex-col gap-2">
          <FormField
            label="Password"
            revealable
            autoComplete="new-password"
            placeholder="••••••••"
            error={errors.password?.message}
            hint="At least 8 characters, with upper and lowercase letters and a number."
            {...register('password')}
          />
          <StrengthMeter value={password} />
        </div>

        <FormField
          label="Confirm password"
          revealable
          autoComplete="new-password"
          placeholder="••••••••"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <div className="flex flex-col gap-1.5">
          <div className="flex items-start gap-2.5">
            <Checkbox
              id="acceptTerms"
              checked={Boolean(acceptTerms)}
              onCheckedChange={(checked) =>
                setValue('acceptTerms', (checked === true) as never, { shouldValidate: true })
              }
              aria-invalid={Boolean(errors.acceptTerms)}
              className="mt-0.5"
            />
            <label htmlFor="acceptTerms" className="text-muted-foreground text-sm leading-relaxed">
              I agree to the{' '}
              <Link href="/terms" className="text-primary-strong font-medium hover:underline">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="text-primary-strong font-medium hover:underline">
                Privacy Policy
              </Link>
              .
            </label>
          </div>
          {errors.acceptTerms ? (
            <p role="alert" className="text-destructive text-xs font-medium">
              {errors.acceptTerms.message}
            </p>
          ) : null}
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
              Creating account…
            </>
          ) : (
            'Create account'
          )}
        </Button>
      </form>

      <p className="text-muted-foreground mt-6 text-center text-sm">
        Already have an account?{' '}
        <Link href="/login" className="text-primary-strong font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
