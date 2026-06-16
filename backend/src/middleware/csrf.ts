import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError.js';
import { CSRF_COOKIE } from '../utils/cookies.js';
import { recordSecurityEvent, securityContext } from '../modules/security/security.service.js';

export const CSRF_HEADER = 'x-csrf-token';

export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on length mismatch, which would itself leak length information.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Double-submit CSRF protection.
 *
 * Cookie auth means the browser attaches credentials to cross-site requests automatically, so a
 * malicious page could POST to our API as the signed-in user. SameSite=Lax blocks the common
 * cases, but this closes the rest: the client must echo the CSRF cookie in a header, and only
 * same-origin JavaScript can read that cookie to do so.
 *
 * Safe methods are exempt, and so are endpoints that carry no ambient authority (login, register)
 * or authenticate by other means (the Stripe webhook, verified by signature).
 */
const EXEMPT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfProtection(req: Request, _res: Response, next: NextFunction) {
  if (EXEMPT_METHODS.has(req.method)) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE] as string | undefined;
  const headerToken = req.get(CSRF_HEADER);

  if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
    // Fire-and-forget: a blocked forgery must still surface on the security page.
    void recordSecurityEvent({ event: 'CSRF_BLOCKED', ...securityContext(req) });
    return next(ApiError.forbidden('Invalid or missing CSRF token.'));
  }

  next();
}
