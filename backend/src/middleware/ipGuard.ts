import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError.js';
import { isIpBlocked, recordSecurityEvent, securityContext } from '../modules/security/security.service.js';

/**
 * Edge IP filter — the outermost brute-force layer. A request from a statically deny-listed IP, or
 * one auto-blocked by the intrusion detector after tripping too many critical controls, is refused
 * before it reaches any route. Allow-listed IPs are never blocked. Mounted before the API routes
 * (but after the payment webhooks, so a gateway is never caught by it).
 */

/** Throttle the block log to once per minute per IP, so a blocked flood cannot spam the log. */
const lastLogged = new Map<string, number>();

export function ipGuard(req: Request, _res: Response, next: NextFunction): void {
  const ip = req.ip;
  if (isIpBlocked(ip)) {
    const key = ip ?? 'unknown';
    const now = Date.now();
    if (now - (lastLogged.get(key) ?? 0) > 60_000) {
      lastLogged.set(key, now);
      void recordSecurityEvent({
        event: 'IP_BLOCKED',
        ...securityContext(req),
        details: { reason: 'denied' },
      });
    }
    return next(ApiError.forbidden('Your access has been temporarily blocked due to suspicious activity.'));
  }
  next();
}
