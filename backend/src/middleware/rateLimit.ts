import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';
import type { Request } from 'express';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';
import { recordSecurityEvent, securityContext } from '../modules/security/security.service.js';

/**
 * In-memory store, which is per-process. Fine for a single instance; Batch 15 swaps in a Redis
 * store before the API is scaled horizontally, since otherwise each replica would enforce its own
 * separate quota.
 */
function make(options: Partial<Options> & { windowMs: number; limit: number }) {
  return rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    /**
     * Signed-in users are limited per account; everyone else by IP.
     *
     * ipKeyGenerator, rather than raw req.ip: a single IPv6 customer is typically handed a whole
     * /64, so keying on the exact address would let one client sidestep the limit by rotating
     * through addresses it already owns. The helper normalises to the subnet.
     */
    keyGenerator: (req: Request) => req.user?.id ?? ipKeyGenerator(req.ip ?? 'unknown'),
    handler: (req, _res, next) => {
      void recordSecurityEvent({ event: 'RATE_LIMITED', ...securityContext(req) });
      next(ApiError.rateLimited());
    },
    /**
     * Skipped for the automated test env, and for a full local test run via DISABLE_RATE_LIMIT.
     * The `!isProd` guard is the important part: setting that flag in production must never
     * disable the limiter, whatever ends up in the environment.
     */
    skip: () => env.isTest || (env.DISABLE_RATE_LIMIT && !env.isProd),
    ...options,
  });
}

export const rateLimiters = {
  /** Login and registration — the endpoints worth brute-forcing. */
  auth: make({ windowMs: 15 * 60 * 1000, limit: 10 }),

  /** Password reset and verification resends, which send email on our dime. */
  sensitive: make({ windowMs: 60 * 60 * 1000, limit: 5 }),

  /** General authenticated writes. */
  write: make({ windowMs: 60 * 1000, limit: 60 }),

  /** Cloudinary signature requests (Batch 10). */
  upload: make({ windowMs: 60 * 60 * 1000, limit: 30 }),
};
