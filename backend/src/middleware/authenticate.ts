import type { NextFunction, Request, Response } from 'express';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { ACCESS_COOKIE } from '../utils/cookies.js';
import { verifyAccessToken } from '../utils/jwt.js';

/**
 * Verifies the access cookie and attaches req.user.
 *
 * The extra user lookup is deliberate. A stateless JWT would let a banned user, or one whose role
 * was just revoked, keep full access until their 15-minute token expired. Comparing tokenVersion
 * against the stored value makes those changes take effect on the very next request, at the cost
 * of one indexed read.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
    if (!token) throw ApiError.unauthenticated();

    const payload = verifyAccessToken(token);

    const user = await User.findOne({ _id: payload.sub, deletedAt: null })
      .select('role status tokenVersion shelterId')
      .lean();

    if (!user) throw ApiError.unauthenticated('Account no longer exists.');

    if (user.tokenVersion !== payload.tokenVersion) {
      throw ApiError.unauthenticated('Your session is no longer valid. Please sign in again.');
    }

    if (user.status === 'banned') throw ApiError.forbidden('This account has been banned.');
    if (user.status === 'suspended') throw ApiError.forbidden('This account is suspended.');

    req.user = {
      id: String(user._id),
      role: user.role,
      status: user.status,
      tokenVersion: user.tokenVersion,
      ...(user.shelterId ? { shelterId: String(user.shelterId) } : {}),
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Attaches req.user when a valid session exists, but never rejects.
 * For endpoints whose response varies by signed-in state — a pet listing that marks favourites,
 * for instance — while remaining fully public.
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.cookies?.[ACCESS_COOKIE]) return next();
  try {
    await authenticate(req, res, () => next());
  } catch {
    next();
  }
}
