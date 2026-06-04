import type { CookieOptions, Response } from 'express';
import { env } from '../config/env.js';

export const ACCESS_COOKIE = 'ph_access';
export const REFRESH_COOKIE = 'ph_refresh';
export const CSRF_COOKIE = 'ph_csrf';
/** Short-lived, httpOnly. Carries the pending-2FA token between the password step and code step. */
export const TWO_FACTOR_COOKIE = 'ph_2fa';

/** Rough parser for the "15m" / "7d" TTL strings, so cookie maxAge matches the JWT expiry. */
function ttlToMs(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl.trim());
  if (!match) return 15 * 60 * 1000;
  const value = Number(match[1]);
  const unit = match[2] as 's' | 'm' | 'h' | 'd';
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;
  return value * multipliers[unit];
}

function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    // Lax survives the Google OAuth redirect back to our callback; None would require Secure
    // and weaken CSRF protection for no benefit here.
    sameSite: 'lax',
    secure: env.isProd,
    path: '/',
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...baseOptions(),
    maxAge: ttlToMs(env.ACCESS_TOKEN_TTL),
  });

  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseOptions(),
    maxAge: ttlToMs(env.REFRESH_TOKEN_TTL),
  });
}

/**
 * The CSRF cookie is deliberately readable by JavaScript — the double-submit pattern requires the
 * client to echo it back in a header. It carries no authority on its own; it only proves the
 * request came from a page that could read our cookies, which a cross-site attacker cannot.
 */
export function setCsrfCookie(res: Response, token: string): void {
  res.cookie(CSRF_COOKIE, token, {
    ...baseOptions(),
    httpOnly: false,
    maxAge: ttlToMs(env.REFRESH_TOKEN_TTL),
  });
}

export function clearAuthCookies(res: Response): void {
  const options = baseOptions();
  res.clearCookie(ACCESS_COOKIE, options);
  res.clearCookie(REFRESH_COOKIE, options);
  res.clearCookie(CSRF_COOKIE, { ...options, httpOnly: false });
}

/** Five minutes: long enough to open the authenticator app, short enough to limit exposure. */
const TWO_FACTOR_TTL_MS = 5 * 60 * 1000;

export function setTwoFactorCookie(res: Response, token: string): void {
  res.cookie(TWO_FACTOR_COOKIE, token, { ...baseOptions(), maxAge: TWO_FACTOR_TTL_MS });
}

export function clearTwoFactorCookie(res: Response): void {
  res.clearCookie(TWO_FACTOR_COOKIE, baseOptions());
}
