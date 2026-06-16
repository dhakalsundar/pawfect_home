import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ApiError } from '../utils/ApiError.js';
import type { UserRole } from '../models/User.js';

/**
 * Coarse role gate. Always paired with `authenticate` upstream.
 *
 * This is only the first half of authorization — it answers "is this kind of user allowed to call
 * this endpoint at all". Whether *this* shelter may edit *that* pet is an ownership question, and
 * it belongs in the service layer folded into the Mongo query. See docs/04-ROLES-PERMISSIONS.md.
 */
export function authorize(...roles: UserRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthenticated());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden('You do not have permission to perform this action.'));
    }
    next();
  };
}
// A requireVerifiedEmail guard belongs here too, but req.user does not carry emailVerified yet.
// It arrives in Batch 6, where submitting an adoption application is the first action that
// genuinely needs a confirmed address — added then, with the field plumbed through authenticate.
