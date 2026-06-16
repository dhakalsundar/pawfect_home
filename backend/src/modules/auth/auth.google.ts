import type { NextFunction, Request, Response } from 'express';
import { passport, type GoogleProfileResult } from '../../config/passport.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import { setAuthCookies, setCsrfCookie, setTwoFactorCookie } from '../../utils/cookies.js';
import { generateCsrfToken } from '../../middleware/csrf.js';
import * as authService from './auth.service.js';

const frontend = env.allowedOrigins[0] ?? 'http://localhost:3000';

/** Starts the OAuth dance, preserving where the user was headed. */
export function googleStart(req: Request, res: Response, next: NextFunction) {
  if (!env.isConfigured.google) return next(ApiError.unavailable('Google sign-in'));

  const callbackUrl = typeof req.query.callbackUrl === 'string' ? req.query.callbackUrl : '/';

  passport.authenticate('google', {
    session: false,
    // `state` is round-tripped by Google, so it carries the redirect target without a cookie.
    state: Buffer.from(JSON.stringify({ callbackUrl })).toString('base64url'),
  })(req, res, next);
}

/**
 * Only same-origin relative paths are accepted as a post-login destination. Without this check,
 * `?callbackUrl=https://evil.example` would turn our login into an open redirect that lends our
 * domain's credibility to a phishing page.
 */
function safeRedirectPath(raw: unknown): string {
  if (typeof raw !== 'string') return '/';
  // Must start with a single slash — "//evil.com" is protocol-relative and leaves our origin.
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

export function googleCallback(req: Request, res: Response, next: NextFunction) {
  if (!env.isConfigured.google) return next(ApiError.unavailable('Google sign-in'));

  passport.authenticate(
    'google',
    { session: false },
    async (err: Error | null, profile: GoogleProfileResult | false) => {
      let callbackUrl = '/';
      try {
        if (typeof req.query.state === 'string') {
          const decoded = JSON.parse(Buffer.from(req.query.state, 'base64url').toString()) as {
            callbackUrl?: string;
          };
          callbackUrl = safeRedirectPath(decoded.callbackUrl);
        }
      } catch {
        callbackUrl = '/';
      }

      // Failures redirect to the login page with a readable reason rather than rendering JSON —
      // the user arrived here from a browser redirect, not a fetch.
      const fail = (reason: string) =>
        res.redirect(`${frontend}/login?error=${encodeURIComponent(reason)}`);

      if (err || !profile) {
        logger.warn({ err }, 'Google OAuth callback failed');
        return fail('Google sign-in failed. Please try again.');
      }

      try {
        const result = await authService.findOrCreateGoogleUser(profile, {
          userAgent: req.get('user-agent'),
          ip: req.ip,
        });

        // 2FA-enabled account: hand over the pending token and send the browser to the code step,
        // preserving the original destination so it resumes after verification.
        if ('twoFactorRequired' in result) {
          setTwoFactorCookie(res, result.pendingToken);
          const next = encodeURIComponent(callbackUrl);
          return res.redirect(`${frontend}/login/2fa?callbackUrl=${next}`);
        }

        setAuthCookies(res, result.session.accessToken, result.session.refreshToken);
        setCsrfCookie(res, generateCsrfToken());

        return res.redirect(`${frontend}${callbackUrl}`);
      } catch (error) {
        const message =
          error instanceof ApiError ? error.message : 'Google sign-in failed. Please try again.';
        return fail(message);
      }
    },
  )(req, res, next);
}
