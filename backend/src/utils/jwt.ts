import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from './ApiError.js';
import type { UserRole, UserStatus } from '../models/User.js';

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  status: UserStatus;
  tokenVersion: number;
  shelterId?: string;
}

export interface RefreshTokenPayload {
  sub: string;
  /** Identifies the stored token document so it can be rotated and revoked. */
  jti: string;
  /** All tokens descended from one login share a family id, so theft revokes the whole chain. */
  family: string;
}

function requireSecrets(): { access: string; refresh: string } {
  if (!env.JWT_ACCESS_SECRET || !env.JWT_REFRESH_SECRET) {
    throw ApiError.unavailable('Authentication');
  }
  return { access: env.JWT_ACCESS_SECRET, refresh: env.JWT_REFRESH_SECRET };
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const { access } = requireSecrets();
  return jwt.sign(payload, access, {
    expiresIn: env.ACCESS_TOKEN_TTL,
    issuer: 'pawfecthome',
  } as SignOptions);
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  const { refresh } = requireSecrets();
  return jwt.sign(payload, refresh, {
    expiresIn: env.REFRESH_TOKEN_TTL,
    issuer: 'pawfecthome',
  } as SignOptions);
}

/**
 * Verifies an access token. Expiry is reported with its own error code because the frontend
 * treats it differently from a genuinely invalid token: TOKEN_EXPIRED triggers a silent refresh
 * and retry, UNAUTHENTICATED sends the user to the login page.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  const { access } = requireSecrets();
  try {
    return jwt.verify(token, access, { issuer: 'pawfecthome' }) as AccessTokenPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) throw ApiError.tokenExpired();
    throw ApiError.unauthenticated('Invalid session. Please sign in again.');
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const { refresh } = requireSecrets();
  try {
    return jwt.verify(token, refresh, { issuer: 'pawfecthome' }) as RefreshTokenPayload;
  } catch {
    throw ApiError.unauthenticated('Your session has expired. Please sign in again.');
  }
}
