import { http } from './http';
import type { User } from '@/types/auth';

/** Sent only when the API has demanded a challenge; ignored server-side otherwise. */
export interface CaptchaAnswer {
  captchaToken?: string;
  captchaAnswer?: string;
}

export interface RegisterPayload extends CaptchaAnswer {
  name: string;
  email: string;
  password: string;
}

export interface LoginPayload extends CaptchaAnswer {
  email: string;
  password: string;
}

export interface CaptchaChallenge {
  token: string;
  /** A data: URI SVG, rendered via <img> so its markup cannot execute. */
  image: string;
}

/** Login returns either the user (done) or a 2FA challenge marker (collect a code next). */
export interface TwoFactorRequired {
  twoFactorRequired: true;
}

export type LoginResult = User | TwoFactorRequired;

export function isTwoFactorRequired(result: LoginResult): result is TwoFactorRequired {
  return 'twoFactorRequired' in result;
}

export interface TwoFactorSetup {
  secret: string;
  otpauthUri: string;
  qrDataUri: string;
}

export interface ActiveSession {
  id: string;
  ip?: string;
  userAgent?: string;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

/**
 * All auth calls go through here rather than components calling http() directly, so the endpoint
 * paths live in one place and every response is typed.
 *
 * No token handling anywhere: the API sets httpOnly cookies the browser attaches automatically,
 * and JavaScript never sees them.
 */
export const authService = {
  register: (payload: RegisterPayload) =>
    http.post<User>('/auth/register', payload).then((r) => r.data),

  login: (payload: LoginPayload) =>
    http.post<LoginResult>('/auth/login', payload).then((r) => r.data),

  /** Completes a 2FA login with a TOTP or backup code; the pending cookie is sent automatically. */
  twoFactorVerify: (code: string) =>
    http.post<User>('/auth/2fa/verify', { code }).then((r) => r.data),

  /** Begins 2FA setup — returns the secret + QR to show the user. */
  twoFactorSetup: () =>
    http.post<TwoFactorSetup>('/auth/2fa/setup').then((r) => r.data),

  /** Confirms setup with a code; returns the one-time backup codes. */
  twoFactorEnable: (code: string) =>
    http.post<{ backupCodes: string[] }>('/auth/2fa/enable', { code }).then((r) => r.data),

  twoFactorDisable: (code: string) =>
    http.post<{ disabled: boolean }>('/auth/2fa/disable', { code }).then((r) => r.data),

  /** Active sessions (devices) for the current user. */
  sessions: () => http.get<ActiveSession[]>('/auth/sessions').then((r) => r.data),

  revokeSession: (family: string) =>
    http.delete<{ revoked: boolean }>(`/auth/sessions/${family}`).then((r) => r.data),

  revokeOtherSessions: () =>
    http.post<{ revoked: boolean }>('/auth/sessions/revoke-others').then((r) => r.data),

  logout: () => http.post<{ loggedOut: boolean }>('/auth/logout').then((r) => r.data),

  me: () => http.get<User>('/auth/me').then((r) => r.data),

  forgotPassword: (email: string) =>
    http.post<{ sent: boolean; message: string }>('/auth/forgot-password', { email }).then((r) => r.data),

  resetPassword: (token: string, password: string) =>
    http.post<{ reset: boolean }>('/auth/reset-password', { token, password }).then((r) => r.data),

  verifyEmail: (token: string) =>
    http.get<User>('/auth/verify-email', { params: { token } }).then((r) => r.data),

  resendVerification: () =>
    http.post<{ sent: boolean }>('/auth/resend-verification').then((r) => r.data),

  changePassword: (currentPassword: string, newPassword: string) =>
    http.put<{ changed: boolean }>('/auth/password', { currentPassword, newPassword }).then((r) => r.data),

  /** Requests a one-time passwordless sign-in link. Always resolves (non-enumerable). */
  requestMagicLink: (email: string) =>
    http
      .post<{ sent: boolean; message: string }>('/auth/magic-link', { email })
      .then((r) => r.data),

  /** Consumes a magic link; resolves to the user or a 2FA challenge marker. */
  magicLinkVerify: (token: string) =>
    http.post<LoginResult>('/auth/magic-link/verify', { token }).then((r) => r.data),

  /** Fetches a CSRF token before the first mutation of an anonymous session. */
  csrf: () => http.get<{ csrfToken: string }>('/auth/csrf').then((r) => r.data),

  /** Fetches a fresh CAPTCHA challenge after the API answers with CAPTCHA_REQUIRED. */
  captcha: () => http.get<CaptchaChallenge>('/auth/captcha').then((r) => r.data),
};

/**
 * Google sign-in is a full-page navigation, not a fetch — the OAuth flow needs real browser
 * redirects, and the API sets our session cookies on the way back.
 */
export function googleSignInUrl(callbackUrl = '/'): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api/v1';
  return `${base}/auth/google?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}
