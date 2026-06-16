import type { Request, Response } from 'express';
import { created, ok } from '../../utils/ApiResponse.js';
import { ApiError } from '../../utils/ApiError.js';
import {
  REFRESH_COOKIE,
  TWO_FACTOR_COOKIE,
  clearAuthCookies,
  clearTwoFactorCookie,
  setAuthCookies,
  setCsrfCookie,
  setTwoFactorCookie,
} from '../../utils/cookies.js';
import { generateCsrfToken } from '../../middleware/csrf.js';
import { generateCaptcha } from '../../utils/captcha.js';
import * as authService from './auth.service.js';
import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from './auth.validators.js';

function sessionContext(req: Request) {
  return { userAgent: req.get('user-agent'), ip: req.ip };
}

/** Sets the auth cookie pair plus a fresh CSRF token. Every sign-in path funnels through here. */
function establishSession(
  res: Response,
  session: { accessToken: string; refreshToken: string },
): void {
  setAuthCookies(res, session.accessToken, session.refreshToken);
  setCsrfCookie(res, generateCsrfToken());
}

export async function register(req: Request, res: Response) {
  const { user, session } = await authService.register(req.body as RegisterInput, sessionContext(req));
  establishSession(res, session);
  return created(res, user);
}

export async function login(req: Request, res: Response) {
  const result = await authService.login(req.body as LoginInput, sessionContext(req));
  // Password accepted but a second factor is required: stash the short-lived pending token in an
  // httpOnly cookie and tell the client to collect a code. No session is issued yet.
  if ('twoFactorRequired' in result) {
    setTwoFactorCookie(res, result.pendingToken);
    return ok(res, { twoFactorRequired: true });
  }
  establishSession(res, result.session);
  return ok(res, result.user);
}

export async function twoFactorVerifyLogin(req: Request, res: Response) {
  const pending = req.cookies?.[TWO_FACTOR_COOKIE] as string | undefined;
  const { code } = req.body as { code: string };
  const { user, session } = await authService.verifyTwoFactorLogin(pending, code, sessionContext(req));
  clearTwoFactorCookie(res);
  establishSession(res, session);
  return ok(res, user);
}

export async function magicLinkRequest(req: Request, res: Response) {
  await authService.requestMagicLink((req.body as { email: string }).email, sessionContext(req));
  // Identical response whether or not the address exists.
  return ok(res, {
    sent: true,
    message: 'If an account exists for that email, a sign-in link is on its way.',
  });
}

export async function magicLinkVerify(req: Request, res: Response) {
  const { token } = req.body as { token: string };
  const result = await authService.verifyMagicLink(token, sessionContext(req));
  if ('twoFactorRequired' in result) {
    setTwoFactorCookie(res, result.pendingToken);
    return ok(res, { twoFactorRequired: true });
  }
  establishSession(res, result.session);
  return ok(res, result.user);
}

export async function twoFactorSetup(req: Request, res: Response) {
  return ok(res, await authService.beginTwoFactorSetup(req.user!.id));
}

export async function twoFactorEnable(req: Request, res: Response) {
  const { code } = req.body as { code: string };
  return ok(res, await authService.enableTwoFactor(req.user!.id, code));
}

export async function twoFactorDisable(req: Request, res: Response) {
  const { code } = req.body as { code: string };
  return ok(res, await authService.disableTwoFactor(req.user!.id, code));
}

// --- Active sessions -------------------------------------------------------

export async function listSessions(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  return ok(res, await authService.listActiveSessions(req.user!.id, token));
}

export async function revokeSession(req: Request, res: Response) {
  await authService.revokeSession(req.user!.id, String(req.params.family));
  return ok(res, { revoked: true });
}

export async function revokeOtherSessions(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  await authService.revokeOtherSessions(req.user!.id, token);
  return ok(res, { revoked: true });
}

export async function refresh(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!token) throw ApiError.unauthenticated('No session to refresh.');

  const session = await authService.refresh(token, sessionContext(req));
  establishSession(res, session);
  return ok(res, { refreshed: true });
}

export async function logout(req: Request, res: Response) {
  await authService.logout(req.cookies?.[REFRESH_COOKIE] as string | undefined);
  clearAuthCookies(res);
  return ok(res, { loggedOut: true });
}

export async function me(req: Request, res: Response) {
  const user = await authService.getCurrentUser(req.user!.id);
  return ok(res, user);
}

export async function verifyEmail(req: Request, res: Response) {
  const { token } = req.query as { token: string };
  const user = await authService.verifyEmail(token);
  return ok(res, user);
}

export async function resendVerification(req: Request, res: Response) {
  await authService.resendVerification(req.user!.id);
  return ok(res, { sent: true });
}

export async function forgotPassword(req: Request, res: Response) {
  await authService.forgotPassword((req.body as { email: string }).email);
  // Identical response whether or not the account exists — see the service comment.
  return ok(res, {
    sent: true,
    message: 'If an account exists for that email, a reset link is on its way.',
  });
}

export async function resetPassword(req: Request, res: Response) {
  const { token, password } = req.body as ResetPasswordInput;
  await authService.resetPassword(token, password);
  // The user is signed out everywhere, including this browser, so they must log in fresh.
  clearAuthCookies(res);
  return ok(res, { reset: true });
}

export async function changePassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = req.body as ChangePasswordInput;
  await authService.changePassword(req.user!.id, currentPassword, newPassword);
  clearAuthCookies(res);
  return ok(res, { changed: true });
}

/** Lets the SPA obtain a CSRF token before its first mutation without needing to sign in. */
export async function csrf(_req: Request, res: Response) {
  const token = generateCsrfToken();
  setCsrfCookie(res, token);
  return ok(res, { csrfToken: token });
}

/**
 * Issues a fresh CAPTCHA challenge. Public — the client fetches one only after the API answers a
 * login/register attempt with CAPTCHA_REQUIRED, and again after each subsequent failure since a
 * solved (or stale) token is single-use.
 */
export async function captcha(_req: Request, res: Response) {
  const challenge = generateCaptcha();
  return ok(res, challenge);
}
