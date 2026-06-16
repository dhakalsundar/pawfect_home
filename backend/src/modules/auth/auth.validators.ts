import { z } from 'zod';

/**
 * Password policy. Length does far more for real-world strength than character-class rules, so the
 * floor is 8 with a mixed-case + digit requirement, and no maximum below bcrypt's own limit.
 *
 * bcrypt silently truncates input beyond 72 BYTES — not characters. Capping here means a user
 * cannot set a 100-character passphrase where only the first 72 bytes actually matter.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(72, 'Password must be at most 72 characters.')
  .regex(/[a-z]/, 'Password must contain a lowercase letter.')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter.')
  .regex(/\d/, 'Password must contain a number.')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, {
    message: 'Password is too long.',
  });

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Email is required.')
  .email('Please enter a valid email address.')
  .max(254, 'Email is too long.');

/**
 * CAPTCHA answer + token, both optional. The server only demands them once an IP has crossed the
 * failure threshold; supplying them when not required is harmless and simply ignored.
 */
const captchaShape = {
  captchaToken: z.string().max(512).optional(),
  captchaAnswer: z.string().max(32).optional(),
};

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters.')
    .max(60, 'Name must be at most 60 characters.'),
  email: emailSchema,
  password: passwordSchema,
  ...captchaShape,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required.'),
  ...captchaShape,
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required.'),
  password: passwordSchema,
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required.'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required.'),
  newPassword: passwordSchema,
});

/** A 6-digit TOTP code or an 8–9 char backup code (XXXX-XXXX). */
export const twoFactorCodeSchema = z.object({
  code: z.string().trim().min(6, 'Enter your 6-digit code.').max(12, 'Code is too long.'),
});

export const magicLinkRequestSchema = z.object({ email: emailSchema });
export const magicLinkVerifySchema = z.object({
  token: z.string().min(1, 'Sign-in token is required.'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
