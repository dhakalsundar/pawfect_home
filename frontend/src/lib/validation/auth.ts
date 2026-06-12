import { z } from 'zod';

/**
 * Mirrors backend/src/modules/auth/auth.validators.ts.
 *
 * These exist purely for form UX — instant, per-field feedback without a round trip. The backend
 * copy is authoritative and re-validates every request, so a mismatch here can only ever produce
 * a worse error message, never a security hole.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(72, 'Password must be at most 72 characters.')
  .regex(/[a-z]/, 'Password must contain a lowercase letter.')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter.')
  .regex(/\d/, 'Password must contain a number.');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Email is required.')
  .email('Please enter a valid email address.');

export const registerFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Name must be at least 2 characters.')
      .max(60, 'Name must be at most 60 characters.'),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password.'),
    acceptTerms: z.literal(true, {
      message: 'You must accept the terms to continue.',
    }),
  })
  // Confirmation is a frontend-only concern — the API takes a single password field.
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export const loginFormSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required.'),
});

export const forgotPasswordFormSchema = z.object({
  email: emailSchema,
});

export const resetPasswordFormSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export type RegisterFormValues = z.infer<typeof registerFormSchema>;
export type LoginFormValues = z.infer<typeof loginFormSchema>;
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordFormSchema>;
export type ResetPasswordFormValues = z.infer<typeof resetPasswordFormSchema>;

/**
 * A small frontend blocklist for instant feedback. The backend (utils/passwordPolicy.ts) holds the
 * authoritative list plus a live breach check; this just lets the meter warn before submit.
 */
const COMMON = new Set([
  'password',
  'password1',
  'password123',
  'passw0rd',
  '12345678',
  'qwerty123',
  'iloveyou1',
  'welcome1',
  'admin123',
  'letmein1',
  'pawfecthome',
]);

export interface PasswordAssessment {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  /** Per-requirement pass/fail, for a checklist under the field. */
  checks: { length: boolean; cases: boolean; number: boolean; symbol: boolean };
  /** A single actionable suggestion, or a hard warning for a common password. */
  feedback: string | null;
}

/** Drives the strength meter + checklist on the register and reset forms. */
export function passwordStrength(value: string): PasswordAssessment {
  const checks = {
    length: value.length >= 8,
    cases: /[a-z]/.test(value) && /[A-Z]/.test(value),
    number: /\d/.test(value),
    symbol: /[^\w\s]/.test(value),
  };

  if (!value) {
    return { score: 0, label: '', checks, feedback: null };
  }

  const isCommon = COMMON.has(value.toLowerCase());

  let score = 0;
  if (checks.length) score++;
  if (value.length >= 12) score++;
  if (checks.cases) score++;
  if (checks.number && checks.symbol) score++;
  if (isCommon) score = 0;

  const labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'] as const;
  const clamped = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;

  let feedback: string | null = null;
  if (isCommon) feedback = 'This is a commonly used password — choose something unique.';
  else if (!checks.length) feedback = 'Use at least 8 characters.';
  else if (value.length < 12) feedback = 'Longer passwords are stronger — aim for 12+ characters.';
  else if (!checks.symbol) feedback = 'Add a symbol to make it stronger.';

  return { score: clamped, label: labels[clamped], checks, feedback };
}
