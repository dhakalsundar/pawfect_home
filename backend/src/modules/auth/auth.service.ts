import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Types } from 'mongoose';
import { User, type UserDocument, type IUser } from '../../models/User.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { VerificationToken } from '../../models/VerificationToken.js';
import { ApiError } from '../../utils/ApiError.js';
import { fakeCompare, comparePassword } from '../../utils/password.js';
import { isCommonPassword, isPasswordBreached } from '../../utils/passwordPolicy.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type AccessTokenPayload,
} from '../../utils/jwt.js';
import { env } from '../../config/env.js';
import { security } from '../../config/security.js';
import { logger } from '../../config/logger.js';
import { recordSecurityEvent } from '../security/security.service.js';
import { verifyCaptcha } from '../../utils/captcha.js';
import { encrypt, decrypt } from '../../utils/crypto.js';
import {
  generateTotpSecret,
  totpAuthUri,
  totpQrDataUri,
  verifyTotp,
  generateBackupCodes,
  matchBackupCode,
} from '../../utils/totp.js';
import {
  clearAuthFailures,
  isCaptchaRequired,
  recordAuthFailure,
} from './auth.throttle.js';
import {
  sendMagicLinkEmail,
  sendOAuthPasswordResetNotice,
  sendPasswordChangedEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from './auth.emails.js';
import type { LoginInput, RegisterInput } from './auth.validators.js';

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const TWO_FACTOR_TTL_MS = 5 * 60 * 1000;
const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

/**
 * Whether the brute-force friction (CAPTCHA gate + account lockout) is suppressed. Same condition
 * the rate limiter uses (see middleware/rateLimit.ts): off for the automated NODE_ENV=test runs and
 * for a full local suite via DISABLE_RATE_LIMIT, because those hammer login from a single IP and
 * would otherwise trip the gate mid-suite. The `!isProd` guard is the load-bearing part — setting
 * the flag in production must never weaken these defences. Security events are still recorded either
 * way, so the audit trail is unaffected. A real deployment (and the security demo) runs with this
 * false, so the controls are fully live.
 */
const bruteForceFrictionOff = env.isTest || (env.DISABLE_RATE_LIMIT && !env.isProd);

/** Tokens are stored hashed so a database leak yields nothing usable. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function randomToken(): string {
  return randomBytes(32).toString('hex');
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: IUser['role'];
  status: IUser['status'];
  provider: IUser['provider'];
  avatar?: { url: string; publicId: string };
  phone?: string;
  bio?: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  shelterId?: string;
  preferences: IUser['preferences'];
  createdAt: string;
}

/**
 * The single mapper from a Mongoose document to what the client is allowed to see.
 * Every auth response goes through this, so a field cannot leak by being forgotten in one handler.
 */
export function toPublicUser(user: IUser | UserDocument): PublicUser {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    provider: user.provider,
    ...(user.avatar?.url ? { avatar: user.avatar } : {}),
    ...(user.phone ? { phone: user.phone } : {}),
    ...(user.bio ? { bio: user.bio } : {}),
    emailVerified: Boolean(user.emailVerified),
    twoFactorEnabled: Boolean(user.twoFactor?.enabled),
    ...(user.shelterId ? { shelterId: String(user.shelterId) } : {}),
    preferences: user.preferences,
    createdAt: user.createdAt.toISOString(),
  };
}

interface SessionContext {
  userAgent?: string;
  ip?: string;
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
}

/**
 * The result of a credential/OAuth sign-in: either a full session, or a stop at the second factor
 * carrying the short-lived pending token. `twoFactorRequired` is the discriminant the controllers
 * switch on.
 */
export type AuthOutcome =
  | { user: PublicUser; session: IssuedSession }
  | { twoFactorRequired: true; pendingToken: string };

function buildAccessPayload(user: IUser | UserDocument): AccessTokenPayload {
  return {
    sub: String(user._id),
    role: user.role,
    status: user.status,
    tokenVersion: user.tokenVersion,
    ...(user.shelterId ? { shelterId: String(user.shelterId) } : {}),
  };
}

/** Issues an access/refresh pair and records the refresh token so it can be rotated and revoked. */
async function issueSession(
  user: IUser | UserDocument,
  context: SessionContext,
  family: string = randomUUID(),
): Promise<IssuedSession> {
  const jti = randomUUID();
  const refreshToken = signRefreshToken({ sub: String(user._id), jti, family });

  await RefreshToken.create({
    user: user._id,
    tokenHash: hashToken(refreshToken),
    family,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    userAgent: context.userAgent,
    ip: context.ip,
  });

  return { accessToken: signAccessToken(buildAccessPayload(user)), refreshToken };
}

async function createVerificationToken(
  userId: Types.ObjectId,
  type: 'email_verify' | 'password_reset' | 'two_factor' | 'magic_link',
  ttlMs: number,
): Promise<string> {
  const token = randomToken();
  await VerificationToken.create({
    user: userId,
    tokenHash: hashToken(token),
    type,
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return token;
}

// --- Password policy ---------------------------------------------------------

/**
 * Enforces the quality rules the zod length/complexity schema cannot: not a common password, not
 * one of this account's recent passwords (reuse prevention), and not present in a known breach
 * corpus. Throws a field-level validation error the forms surface inline.
 */
async function assertPasswordAllowed(
  password: string,
  field: 'password' | 'newPassword',
  opts: { currentHash?: string; history?: string[]; userId?: string } = {},
): Promise<void> {
  if (isCommonPassword(password)) {
    throw ApiError.validation('That password is too common — choose something less guessable.', {
      [field]: 'Too common — choose a less guessable password.',
    });
  }

  if (opts.currentHash && (await comparePassword(password, opts.currentHash))) {
    throw ApiError.validation('Your new password must be different from your current one.', {
      [field]: 'Must differ from your current password.',
    });
  }

  for (const previous of opts.history ?? []) {
    if (await comparePassword(password, previous)) {
      if (opts.userId) {
        await recordSecurityEvent({ event: 'PASSWORD_REUSE_BLOCKED', userId: opts.userId });
      }
      throw ApiError.validation('You have used this password recently — choose a new one.', {
        [field]: 'You have used this password before.',
      });
    }
  }

  if (await isPasswordBreached(password)) {
    throw ApiError.validation(
      'This password has appeared in a known data breach — please choose another.',
      { [field]: 'Found in a data breach — choose another.' },
    );
  }
}

/** Pushes the outgoing hash onto the history, newest first, capped to the configured size. */
function pushPasswordHistory(existing: string[] | undefined, outgoingHash: string): string[] {
  return [outgoingHash, ...(existing ?? [])].slice(0, security.password.historySize);
}

// --- Brute-force defences ----------------------------------------------------

/**
 * Demands a solved CAPTCHA once this IP has crossed the failure threshold. A no-op for the vast
 * majority of requests, so honest users are never challenged. Throws CAPTCHA_REQUIRED otherwise,
 * which the client turns into a challenge widget.
 */
async function enforceCaptcha(
  context: SessionContext,
  email: string | undefined,
  captchaToken: string | undefined,
  captchaAnswer: string | undefined,
): Promise<void> {
  if (bruteForceFrictionOff) return;
  if (!isCaptchaRequired(context.ip)) return;

  if (verifyCaptcha(captchaToken, captchaAnswer)) return;

  const provided = Boolean(captchaToken && captchaAnswer);
  if (provided) {
    // A wrong answer is itself a failure — a bot brute-forcing the challenge must not get free tries.
    recordAuthFailure(context.ip);
    await recordSecurityEvent({
      event: 'CAPTCHA_FAILED',
      emailAttempted: email,
      ip: context.ip,
      userAgent: context.userAgent,
    });
    throw ApiError.captchaRequired('That answer was incorrect. Please try the new challenge.');
  }

  await recordSecurityEvent({
    event: 'CAPTCHA_REQUIRED',
    emailAttempted: email,
    ip: context.ip,
    userAgent: context.userAgent,
  });
  throw ApiError.captchaRequired();
}

/**
 * Records a failed password attempt against the account and locks it once the threshold is hit.
 * The lock is persistent (survives a restart) because it lives on the user document, unlike the
 * per-IP CAPTCHA gate.
 */
async function registerFailedAttempt(user: UserDocument, context: SessionContext): Promise<void> {
  user.failedLoginAttempts = (user.failedLoginAttempts ?? 0) + 1;
  let locked = false;

  if (user.failedLoginAttempts >= security.lockout.maxFailedAttempts) {
    user.lockUntil = new Date(Date.now() + security.lockout.lockDurationMs);
    user.failedLoginAttempts = 0; // the lock governs from here; the counter restarts after it lifts
    locked = true;
  }

  await user.save({ validateBeforeSave: false });

  await recordSecurityEvent({
    event: 'LOGIN_FAILED',
    userId: String(user._id),
    emailAttempted: user.email,
    ip: context.ip,
    userAgent: context.userAgent,
    details: { reason: 'bad_password' },
  });

  if (locked) {
    await recordSecurityEvent({
      event: 'ACCOUNT_LOCKED',
      userId: String(user._id),
      emailAttempted: user.email,
      ip: context.ip,
      userAgent: context.userAgent,
      details: { until: user.lockUntil },
    });
  }
}

// --- Registration ----------------------------------------------------------

export async function register(input: RegisterInput, context: SessionContext) {
  await enforceCaptcha(context, input.email, input.captchaToken, input.captchaAnswer);

  const existing = await User.findOne({ email: input.email }).select('_id').lean();
  if (existing) {
    // A rapid scan of which addresses already exist is an enumeration probe — feed it to the gate
    // so a burst of these starts demanding a CAPTCHA.
    if (!bruteForceFrictionOff) recordAuthFailure(context.ip);
    // Registration cannot avoid revealing that an address is taken — the user must be told why
    // they can't sign up. Password reset, which has no such requirement, stays non-enumerable.
    throw ApiError.conflict('An account with that email already exists.');
  }

  await assertPasswordAllowed(input.password, 'password');

  const user = await User.create({
    name: input.name,
    email: input.email,
    password: input.password,
    provider: 'credentials',
    passwordChangedAt: new Date(),
  });

  const token = await createVerificationToken(user._id, 'email_verify', EMAIL_VERIFY_TTL_MS);
  await sendVerificationEmail(user.email, user.name, token);

  const session = await issueSession(user, context);
  return { user: toPublicUser(user), session };
}

// --- Login -----------------------------------------------------------------

export async function login(input: LoginInput, context: SessionContext): Promise<AuthOutcome> {
  await enforceCaptcha(context, input.email, input.captchaToken, input.captchaAnswer);

  const user = await User.findOne({ email: input.email, deletedAt: null }).select(
    '+password +failedLoginAttempts +lockUntil',
  );

  if (!user) {
    // Burn the same time a real bcrypt comparison would, so response timing does not reveal
    // whether the address has an account.
    await fakeCompare();
    if (!bruteForceFrictionOff) recordAuthFailure(context.ip);
    // Recorded server-side only — the response stays identical, so this leaks nothing to the
    // client, but a credential-stuffing run against unknown addresses is now visible to an admin.
    await recordSecurityEvent({
      event: 'LOGIN_FAILED',
      emailAttempted: input.email,
      ip: context.ip,
      userAgent: context.userAgent,
      details: { reason: 'no_such_account' },
    });
    throw ApiError.unauthenticated('Incorrect email or password.');
  }

  if (user.provider === 'google' && !user.password) {
    throw ApiError.conflict(
      'This account uses Google sign-in. Use the "Continue with Google" button.',
    );
  }

  /**
   * Lock check comes BEFORE the password comparison — a locked account is refused even with the
   * correct password, which is the whole point of a lockout. Yes, this tells a caller the account
   * exists and is locked; that disclosure is inherent to communicating a lockout at all, and the
   * "no such account" path above deliberately never locks, so the two cannot be conflated.
   */
  if (!bruteForceFrictionOff && user.lockUntil && user.lockUntil.getTime() > Date.now()) {
    const retryAfterSec = Math.ceil((user.lockUntil.getTime() - Date.now()) / 1000);
    await recordSecurityEvent({
      event: 'LOCKED_LOGIN_BLOCKED',
      userId: String(user._id),
      emailAttempted: input.email,
      ip: context.ip,
      userAgent: context.userAgent,
    });
    throw ApiError.accountLocked(
      retryAfterSec,
      `Too many failed attempts. Your account is locked for ${Math.ceil(retryAfterSec / 60)} more minute(s).`,
    );
  }

  const valid = await user.comparePassword(input.password);
  if (!valid) {
    if (bruteForceFrictionOff) {
      // Still record the event for the audit trail, just skip the lockout accounting.
      await recordSecurityEvent({
        event: 'LOGIN_FAILED',
        userId: String(user._id),
        emailAttempted: input.email,
        ip: context.ip,
        userAgent: context.userAgent,
        details: { reason: 'bad_password' },
      });
    } else {
      recordAuthFailure(context.ip);
      await registerFailedAttempt(user, context);
    }
    throw ApiError.unauthenticated('Incorrect email or password.');
  }

  if (user.status === 'banned') throw ApiError.forbidden('This account has been banned.');
  if (user.status === 'suspended') throw ApiError.forbidden('This account is suspended.');

  // A clean sign-in wipes both the per-account counter and the per-IP CAPTCHA gate. The password
  // is now proven; the second factor (if any) is challenged separately below.
  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });
  clearAuthFailures(context.ip);

  // Second factor: issue a short-lived pending token, NOT a session, until the code is verified.
  if (user.twoFactor?.enabled) {
    const pendingToken = await createVerificationToken(user._id, 'two_factor', TWO_FACTOR_TTL_MS);
    await recordSecurityEvent({
      event: 'TWO_FACTOR_CHALLENGED',
      userId: String(user._id),
      emailAttempted: input.email,
      ip: context.ip,
      userAgent: context.userAgent,
    });
    return { twoFactorRequired: true as const, pendingToken };
  }

  const session = await issueSession(user, context);
  await recordSecurityEvent({
    event: 'LOGIN_SUCCESS',
    userId: String(user._id),
    emailAttempted: input.email,
    ip: context.ip,
    userAgent: context.userAgent,
  });
  return { user: toPublicUser(user), session };
}

// --- Two-factor authentication (TOTP) --------------------------------------

/**
 * Completes a login that stopped at the second factor. The pending token proves the password step
 * already succeeded; here we check the 6-digit TOTP code (or a single-use backup code) and only
 * then issue the real session.
 */
export async function verifyTwoFactorLogin(
  pendingToken: string | undefined,
  code: string,
  context: SessionContext,
) {
  if (!pendingToken) throw ApiError.unauthenticated('Your verification session has expired.');

  const stored = await VerificationToken.findOne({
    tokenHash: hashToken(pendingToken),
    type: 'two_factor',
  });
  if (!stored || stored.usedAt || stored.expiresAt.getTime() < Date.now()) {
    throw ApiError.unauthenticated('Your verification session has expired. Please sign in again.');
  }

  const user = await User.findById(stored.user).select(
    '+twoFactor.secret +twoFactor.backupCodes +failedLoginAttempts +lockUntil',
  );
  if (!user || !user.twoFactor?.enabled || !user.twoFactor.secret) {
    throw ApiError.unauthenticated('Two-factor authentication is not set up for this account.');
  }

  const secret = decrypt(user.twoFactor.secret);
  let ok = verifyTotp(secret, code);
  let usedBackup = false;

  if (!ok) {
    // A backup code is accepted in place of the app code, and burned so it cannot be reused.
    const matched = matchBackupCode(code, user.twoFactor.backupCodes);
    if (matched) {
      ok = true;
      usedBackup = true;
      user.twoFactor.backupCodes = user.twoFactor.backupCodes.filter((h) => h !== matched);
      await user.save({ validateBeforeSave: false });
    }
  }

  if (!ok) {
    await recordSecurityEvent({
      event: 'TWO_FACTOR_FAILED',
      userId: String(user._id),
      emailAttempted: user.email,
      ip: context.ip,
      userAgent: context.userAgent,
    });
    // A wrong second factor is a failed attempt too — count it toward the account lockout unless
    // friction is disabled for automated runs.
    if (!bruteForceFrictionOff) await registerFailedAttempt(user, context);
    throw ApiError.unauthenticated('That code is incorrect or has expired.');
  }

  stored.usedAt = new Date();
  await stored.save();

  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  await user.save({ validateBeforeSave: false });

  const session = await issueSession(user, context);
  await recordSecurityEvent({
    event: usedBackup ? 'BACKUP_CODE_USED' : 'TWO_FACTOR_SUCCESS',
    userId: String(user._id),
    emailAttempted: user.email,
    ip: context.ip,
    userAgent: context.userAgent,
  });
  await recordSecurityEvent({
    event: 'LOGIN_SUCCESS',
    userId: String(user._id),
    emailAttempted: user.email,
    ip: context.ip,
    userAgent: context.userAgent,
    details: { via: usedBackup ? 'backup_code' : 'totp' },
  });
  return { user: toPublicUser(user), session };
}

/** Step 1 of enabling 2FA: mint a secret, stash it (encrypted) as pending, hand back the QR. */
export async function beginTwoFactorSetup(userId: string) {
  const user = await User.findOne({ _id: userId, deletedAt: null });
  if (!user) throw ApiError.notFound('Account');
  if (user.twoFactor?.enabled) {
    throw ApiError.conflict('Two-factor authentication is already enabled.');
  }

  const secret = generateTotpSecret();
  user.twoFactor.pendingSecret = encrypt(secret);
  await user.save({ validateBeforeSave: false });

  const otpauthUri = totpAuthUri(secret, user.email);
  const qrDataUri = await totpQrDataUri(otpauthUri);
  // `secret` is returned for manual entry in apps that cannot scan; it is never stored in the clear.
  return { secret, otpauthUri, qrDataUri };
}

/** Step 2: confirm the authenticator is paired by checking one code, then switch 2FA on. */
export async function enableTwoFactor(userId: string, code: string) {
  const user = await User.findOne({ _id: userId, deletedAt: null }).select(
    '+twoFactor.secret +twoFactor.pendingSecret +twoFactor.backupCodes',
  );
  if (!user) throw ApiError.notFound('Account');
  if (user.twoFactor?.enabled) {
    throw ApiError.conflict('Two-factor authentication is already enabled.');
  }
  if (!user.twoFactor?.pendingSecret) {
    throw ApiError.validation('Start two-factor setup first.');
  }

  const secret = decrypt(user.twoFactor.pendingSecret);
  if (!verifyTotp(secret, code)) {
    throw ApiError.validation('That code is incorrect. Check your authenticator app and try again.', {
      code: 'Incorrect code.',
    });
  }

  const { plain, hashed } = generateBackupCodes();
  user.twoFactor.secret = user.twoFactor.pendingSecret;
  user.twoFactor.pendingSecret = undefined;
  user.twoFactor.enabled = true;
  user.twoFactor.enabledAt = new Date();
  user.twoFactor.backupCodes = hashed;
  await user.save({ validateBeforeSave: false });

  await recordSecurityEvent({ event: 'TWO_FACTOR_ENABLED', userId: String(user._id) });
  // Backup codes are shown exactly once, here.
  return { backupCodes: plain };
}

/** Turns 2FA off. Requires a current code (or backup code), so a hijacked session cannot do it. */
export async function disableTwoFactor(userId: string, code: string) {
  const user = await User.findOne({ _id: userId, deletedAt: null }).select(
    '+twoFactor.secret +twoFactor.backupCodes',
  );
  if (!user) throw ApiError.notFound('Account');
  if (!user.twoFactor?.enabled || !user.twoFactor.secret) {
    throw ApiError.conflict('Two-factor authentication is not enabled.');
  }

  const secret = decrypt(user.twoFactor.secret);
  const ok = verifyTotp(secret, code) || Boolean(matchBackupCode(code, user.twoFactor.backupCodes));
  if (!ok) {
    throw ApiError.validation('That code is incorrect.', { code: 'Incorrect code.' });
  }

  user.twoFactor.enabled = false;
  user.twoFactor.secret = undefined;
  user.twoFactor.pendingSecret = undefined;
  user.twoFactor.backupCodes = [];
  user.twoFactor.enabledAt = undefined;
  await user.save({ validateBeforeSave: false });

  await recordSecurityEvent({ event: 'TWO_FACTOR_DISABLED', userId: String(user._id) });
  return { disabled: true };
}

// --- Passwordless (magic link) ---------------------------------------------

/**
 * Emails a one-time sign-in link. Always resolves the same way whether or not the address has an
 * account, so it cannot be used to enumerate users — exactly like the password-reset path.
 */
export async function requestMagicLink(email: string, context: SessionContext): Promise<void> {
  const user = await User.findOne({ email, deletedAt: null });
  if (!user || user.status === 'banned' || user.status === 'suspended') return;

  // Only the newest link should work — invalidate any outstanding ones.
  await VerificationToken.updateMany(
    { user: user._id, type: 'magic_link', usedAt: null },
    { usedAt: new Date() },
  );
  const token = await createVerificationToken(user._id, 'magic_link', MAGIC_LINK_TTL_MS);
  await sendMagicLinkEmail(user.email, user.name, token);
  await recordSecurityEvent({
    event: 'MAGIC_LINK_REQUESTED',
    userId: String(user._id),
    emailAttempted: email,
    ip: context.ip,
    userAgent: context.userAgent,
  });
}

/** Consumes a magic link. 2FA still applies — an emailed link proves the address, not the factor. */
export async function verifyMagicLink(
  token: string,
  context: SessionContext,
): Promise<AuthOutcome> {
  const stored = await VerificationToken.findOne({
    tokenHash: hashToken(token),
    type: 'magic_link',
  });
  if (!stored || stored.usedAt || stored.expiresAt.getTime() < Date.now()) {
    throw ApiError.validation('This sign-in link is invalid or has expired.');
  }

  const user = await User.findOne({ _id: stored.user, deletedAt: null });
  if (!user) throw ApiError.notFound('Account');
  if (user.status === 'banned') throw ApiError.forbidden('This account has been banned.');
  if (user.status === 'suspended') throw ApiError.forbidden('This account is suspended.');

  stored.usedAt = new Date();
  await stored.save();

  // Receiving the emailed link proves control of the address.
  if (!user.emailVerified) user.emailVerified = new Date();
  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  await recordSecurityEvent({
    event: 'MAGIC_LINK_CONSUMED',
    userId: String(user._id),
    ip: context.ip,
    userAgent: context.userAgent,
  });

  if (user.twoFactor?.enabled) {
    const pendingToken = await createVerificationToken(user._id, 'two_factor', TWO_FACTOR_TTL_MS);
    await recordSecurityEvent({
      event: 'TWO_FACTOR_CHALLENGED',
      userId: String(user._id),
      ip: context.ip,
      userAgent: context.userAgent,
      details: { via: 'magic_link' },
    });
    return { twoFactorRequired: true as const, pendingToken };
  }

  const session = await issueSession(user, context);
  await recordSecurityEvent({
    event: 'LOGIN_SUCCESS',
    userId: String(user._id),
    emailAttempted: user.email,
    ip: context.ip,
    userAgent: context.userAgent,
    details: { via: 'magic_link' },
  });
  return { user: toPublicUser(user), session };
}

// --- Refresh (rotation + reuse detection) ----------------------------------

export async function refresh(token: string, context: SessionContext): Promise<IssuedSession> {
  const payload = verifyRefreshToken(token);
  const stored = await RefreshToken.findOne({ tokenHash: hashToken(token) });

  if (!stored || stored.revokedAt) {
    throw ApiError.unauthenticated('Your session has expired. Please sign in again.');
  }

  /**
   * Reuse detection.
   *
   * A rotated token should never be presented again — the legitimate client discarded it the
   * moment it received a replacement. Seeing one means the token was captured, and we cannot tell
   * whether this request is the attacker or the victim. So we revoke the entire family, forcing a
   * fresh login that the attacker cannot complete without the password.
   */
  if (stored.rotatedAt) {
    await RefreshToken.updateMany(
      { family: stored.family, revokedAt: null },
      { revokedAt: new Date() },
    );
    logger.warn(
      { userId: String(stored.user), family: stored.family, ip: context.ip },
      'Refresh token reuse detected — token family revoked',
    );
    await recordSecurityEvent({
      event: 'REFRESH_REUSE_DETECTED',
      userId: String(stored.user),
      ip: context.ip,
      userAgent: context.userAgent,
      details: { family: stored.family },
    });
    throw ApiError.unauthenticated('Your session has expired. Please sign in again.');
  }

  if (stored.expiresAt.getTime() < Date.now()) {
    throw ApiError.unauthenticated('Your session has expired. Please sign in again.');
  }

  const user = await User.findOne({ _id: payload.sub, deletedAt: null });
  if (!user) throw ApiError.unauthenticated('Account no longer exists.');
  if (user.status === 'banned') throw ApiError.forbidden('This account has been banned.');

  /**
   * Zero-trust device binding. A refresh token is bound at issue time to the device (user-agent)
   * that created it; every rotation re-binds to the same device. A token presented from a different
   * user-agent is therefore either a stolen token replayed elsewhere or a materially changed client
   * — in both cases we refuse and revoke the whole family, forcing a fresh password login the thief
   * cannot complete. Only enforced when both agents are known.
   */
  if (stored.userAgent && context.userAgent && stored.userAgent !== context.userAgent) {
    await RefreshToken.updateMany(
      { family: stored.family, revokedAt: null },
      { revokedAt: new Date() },
    );
    await recordSecurityEvent({
      event: 'DEVICE_MISMATCH_BLOCKED',
      userId: String(user._id),
      ip: context.ip,
      userAgent: context.userAgent,
      details: { boundTo: stored.userAgent },
    });
    throw ApiError.unauthenticated(
      'This session could not be verified on this device. Please sign in again.',
    );
  }

  stored.rotatedAt = new Date();
  await stored.save();

  // Same family — this is a continuation of the original login, not a new one.
  return issueSession(user, context, stored.family);
}

// --- Logout ----------------------------------------------------------------

export async function logout(token?: string): Promise<void> {
  if (!token) return;
  const stored = await RefreshToken.findOne({ tokenHash: hashToken(token) });
  if (!stored) return;
  // Revoke the whole family: signing out should end the session chain, not just this one link.
  await RefreshToken.updateMany({ family: stored.family, revokedAt: null }, { revokedAt: new Date() });
}

/** Used by password reset and by admin role changes — kills every session for the user. */
export async function revokeAllSessions(userId: Types.ObjectId | string): Promise<void> {
  await RefreshToken.updateMany({ user: userId, revokedAt: null }, { revokedAt: new Date() });
}

// --- Active session management (device list) --------------------------------

export interface ActiveSession {
  id: string;
  ip?: string;
  userAgent?: string;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

/**
 * One entry per active session (family): the live leaf is the token that has not been rotated,
 * revoked or expired. `current` marks the family behind the caller's own refresh cookie.
 */
export async function listActiveSessions(
  userId: string,
  currentToken?: string,
): Promise<ActiveSession[]> {
  const currentFamily = currentToken
    ? (await RefreshToken.findOne({ tokenHash: hashToken(currentToken) }).select('family').lean())
        ?.family
    : undefined;

  const leaves = await RefreshToken.find({
    user: userId,
    revokedAt: null,
    rotatedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .sort({ updatedAt: -1 })
    .lean();

  return leaves.map((leaf) => ({
    id: leaf.family,
    ...(leaf.ip ? { ip: leaf.ip } : {}),
    ...(leaf.userAgent ? { userAgent: leaf.userAgent } : {}),
    createdAt: leaf.createdAt.toISOString(),
    lastUsedAt: leaf.updatedAt.toISOString(),
    current: leaf.family === currentFamily,
  }));
}

/** Revokes one session (family) belonging to the user. Ownership is folded into the query. */
export async function revokeSession(userId: string, family: string): Promise<void> {
  const result = await RefreshToken.updateMany(
    { user: userId, family, revokedAt: null },
    { revokedAt: new Date() },
  );
  if (result.matchedCount === 0) throw ApiError.notFound('Session');
  await recordSecurityEvent({ event: 'SESSION_REVOKED', userId, details: { family } });
}

/** "Sign out everywhere else" — revokes every family except the caller's current one. */
export async function revokeOtherSessions(userId: string, currentToken?: string): Promise<void> {
  const currentFamily = currentToken
    ? (await RefreshToken.findOne({ tokenHash: hashToken(currentToken) }).select('family').lean())
        ?.family
    : undefined;

  await RefreshToken.updateMany(
    { user: userId, revokedAt: null, ...(currentFamily ? { family: { $ne: currentFamily } } : {}) },
    { revokedAt: new Date() },
  );
  await recordSecurityEvent({ event: 'SESSIONS_REVOKED_ALL', userId, details: { kept: currentFamily } });
}

// --- Email verification ----------------------------------------------------

export async function verifyEmail(token: string) {
  const stored = await VerificationToken.findOne({
    tokenHash: hashToken(token),
    type: 'email_verify',
  });

  if (!stored || stored.usedAt || stored.expiresAt.getTime() < Date.now()) {
    throw ApiError.validation('This verification link is invalid or has expired.');
  }

  const user = await User.findById(stored.user);
  if (!user) throw ApiError.notFound('Account');

  if (!user.emailVerified) {
    user.emailVerified = new Date();
    await user.save({ validateBeforeSave: false });
  }

  stored.usedAt = new Date();
  await stored.save();

  return toPublicUser(user);
}

export async function resendVerification(userId: string): Promise<void> {
  const user = await User.findOne({ _id: userId, deletedAt: null });
  if (!user) throw ApiError.notFound('Account');
  if (user.emailVerified) throw ApiError.conflict('Your email is already verified.');

  // Invalidate outstanding links so only the newest one works.
  await VerificationToken.updateMany(
    { user: user._id, type: 'email_verify', usedAt: null },
    { usedAt: new Date() },
  );

  const token = await createVerificationToken(user._id, 'email_verify', EMAIL_VERIFY_TTL_MS);
  await sendVerificationEmail(user.email, user.name, token);
}

// --- Password reset --------------------------------------------------------

/**
 * Always resolves successfully, whether or not the address exists. Responding differently would
 * turn this endpoint into a free account-enumeration oracle.
 */
export async function forgotPassword(email: string): Promise<void> {
  const user = await User.findOne({ email, deletedAt: null });
  if (!user) return;

  if (user.provider === 'google' && !user.password) {
    // Tell the real owner why no reset link is coming, without telling a stranger anything.
    await sendOAuthPasswordResetNotice(user.email, user.name);
    return;
  }

  await VerificationToken.updateMany(
    { user: user._id, type: 'password_reset', usedAt: null },
    { usedAt: new Date() },
  );

  const token = await createVerificationToken(user._id, 'password_reset', PASSWORD_RESET_TTL_MS);
  await sendPasswordResetEmail(user.email, user.name, token);
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const stored = await VerificationToken.findOne({
    tokenHash: hashToken(token),
    type: 'password_reset',
  });

  if (!stored || stored.usedAt || stored.expiresAt.getTime() < Date.now()) {
    throw ApiError.validation('This reset link is invalid or has expired.');
  }

  const user = await User.findById(stored.user).select('+password +passwordHistory');
  if (!user) throw ApiError.notFound('Account');

  await assertPasswordAllowed(newPassword, 'password', {
    ...(user.password ? { currentHash: user.password } : {}),
    history: user.passwordHistory,
    userId: String(user._id),
  });

  if (user.password) user.passwordHistory = pushPasswordHistory(user.passwordHistory, user.password);
  user.passwordChangedAt = new Date();
  user.password = newPassword; // hashed by the pre-save hook
  // Invalidates every access token already issued, so a session the attacker holds dies now
  // rather than in up to 15 minutes.
  user.tokenVersion += 1;
  if (!user.emailVerified) {
    // Receiving the emailed link proves control of the address.
    user.emailVerified = new Date();
  }
  await user.save();

  stored.usedAt = new Date();
  await stored.save();

  await revokeAllSessions(user._id);
  await recordSecurityEvent({ event: 'PASSWORD_RESET', userId: String(user._id) });
  await sendPasswordChangedEmail(user.email, user.name);
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await User.findOne({ _id: userId, deletedAt: null }).select(
    '+password +passwordHistory',
  );
  if (!user) throw ApiError.notFound('Account');

  if (!user.password) {
    throw ApiError.conflict('Your account signs in with Google and has no password to change.');
  }

  const valid = await user.comparePassword(currentPassword);
  if (!valid) {
    throw ApiError.validation('Current password is incorrect.', {
      currentPassword: 'Current password is incorrect.',
    });
  }

  await assertPasswordAllowed(newPassword, 'newPassword', {
    currentHash: user.password,
    history: user.passwordHistory,
    userId: String(user._id),
  });

  user.passwordHistory = pushPasswordHistory(user.passwordHistory, user.password);
  user.passwordChangedAt = new Date();
  user.password = newPassword;
  user.tokenVersion += 1;
  await user.save();

  await revokeAllSessions(user._id);
  await recordSecurityEvent({ event: 'PASSWORD_CHANGED', userId: String(user._id) });
  await sendPasswordChangedEmail(user.email, user.name);
}

// --- Google OAuth ----------------------------------------------------------

interface GoogleProfileInput {
  googleId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  emailVerified: boolean;
}

/**
 * Finds or creates the account behind a Google profile.
 *
 * Linking by email is only safe when Google says the address is verified. Without that check,
 * anyone able to create a Google account claiming an unverified address could take over an
 * existing PawfectHome account with the same email.
 */
export async function findOrCreateGoogleUser(
  profile: GoogleProfileInput,
  context: SessionContext,
): Promise<AuthOutcome> {
  let user = await User.findOne({ googleId: profile.googleId, deletedAt: null });

  if (!user) {
    const byEmail = await User.findOne({ email: profile.email, deletedAt: null });

    if (byEmail) {
      if (!profile.emailVerified) {
        throw ApiError.conflict(
          'An account with this email already exists. Sign in with your password instead.',
        );
      }
      byEmail.googleId = profile.googleId;
      byEmail.emailVerified ??= new Date();
      if (!byEmail.avatar?.url && profile.avatarUrl) {
        byEmail.avatar = { url: profile.avatarUrl, publicId: '' };
      }
      await byEmail.save({ validateBeforeSave: false });
      user = byEmail;
    } else {
      user = await User.create({
        name: profile.name,
        email: profile.email,
        provider: 'google',
        googleId: profile.googleId,
        emailVerified: profile.emailVerified ? new Date() : null,
        ...(profile.avatarUrl ? { avatar: { url: profile.avatarUrl, publicId: '' } } : {}),
      });
    }
  }

  if (user.status === 'banned') throw ApiError.forbidden('This account has been banned.');

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  // Google proves the email, but it is not the second factor: a 2FA-enabled account still gets a
  // pending token, not a session. The callback handler routes the browser to the code step.
  if (user.twoFactor?.enabled) {
    const pendingToken = await createVerificationToken(user._id, 'two_factor', TWO_FACTOR_TTL_MS);
    await recordSecurityEvent({
      event: 'TWO_FACTOR_CHALLENGED',
      userId: String(user._id),
      emailAttempted: user.email,
      ip: context.ip,
      userAgent: context.userAgent,
      details: { via: 'google' },
    });
    return { twoFactorRequired: true as const, pendingToken };
  }

  const session = await issueSession(user, context);
  return { user: toPublicUser(user), session };
}

// --- Current user ----------------------------------------------------------

export async function getCurrentUser(userId: string): Promise<PublicUser> {
  const user = await User.findOne({ _id: userId, deletedAt: null }).lean();
  if (!user) throw ApiError.notFound('Account');
  return toPublicUser(user);
}

export const authConfig = { isGoogleEnabled: env.isConfigured.google };
