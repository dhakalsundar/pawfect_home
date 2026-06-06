import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { csrfProtection } from '../../middleware/csrf.js';
import { rateLimiters } from '../../middleware/rateLimit.js';
import * as controller from './auth.controller.js';
import { googleCallback, googleStart } from './auth.google.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  magicLinkRequestSchema,
  magicLinkVerifySchema,
  registerSchema,
  resetPasswordSchema,
  twoFactorCodeSchema,
  verifyEmailSchema,
} from './auth.validators.js';

const router = Router();

// Bootstrap for the client's double-submit CSRF token.
router.get('/csrf', asyncHandler(controller.csrf));

// A fresh CAPTCHA challenge — fetched by the client only once the API demands one.
router.get('/captcha', asyncHandler(controller.captcha));

/**
 * Register, login, refresh and reset are exempt from CSRF on purpose: none of them relies on
 * ambient cookie authority. Register and login carry credentials in the body, and reset carries a
 * single-use emailed token — a cross-site attacker gains nothing by forging any of them.
 * Refresh is protected instead by the rotation + reuse detection in the service.
 */
router.post(
  '/register',
  rateLimiters.auth,
  validate(registerSchema),
  asyncHandler(controller.register),
);

router.post('/login', rateLimiters.auth, validate(loginSchema), asyncHandler(controller.login));

/**
 * Completes a 2FA login. CSRF-exempt for the same reason login is: authority comes from the
 * short-lived pending-2FA cookie plus the code, not from ambient session cookies. Rate-limited so
 * the 6-digit code cannot be brute-forced.
 */
router.post(
  '/2fa/verify',
  rateLimiters.auth,
  validate(twoFactorCodeSchema),
  asyncHandler(controller.twoFactorVerifyLogin),
);

/**
 * Passwordless sign-in. Requesting a link is rate-limited like other email-sending endpoints;
 * verifying carries the single-use emailed token, so it is CSRF-exempt like login for the same
 * reason — no ambient cookie authority is involved.
 */
router.post(
  '/magic-link',
  rateLimiters.sensitive,
  validate(magicLinkRequestSchema),
  asyncHandler(controller.magicLinkRequest),
);
router.post(
  '/magic-link/verify',
  rateLimiters.auth,
  validate(magicLinkVerifySchema),
  asyncHandler(controller.magicLinkVerify),
);

router.post('/refresh', asyncHandler(controller.refresh));

router.post(
  '/forgot-password',
  rateLimiters.sensitive,
  validate(forgotPasswordSchema),
  asyncHandler(controller.forgotPassword),
);

router.post(
  '/reset-password',
  rateLimiters.sensitive,
  validate(resetPasswordSchema),
  asyncHandler(controller.resetPassword),
);

router.get('/verify-email', validate(verifyEmailSchema, 'query'), asyncHandler(controller.verifyEmail));

// Google OAuth — browser redirects, so no CSRF header is possible or needed.
router.get('/google', googleStart);
router.get('/google/callback', googleCallback);

// --- Authenticated ---------------------------------------------------------

router.get('/me', authenticate, asyncHandler(controller.me));

router.post('/logout', authenticate, csrfProtection, asyncHandler(controller.logout));

router.post(
  '/resend-verification',
  authenticate,
  csrfProtection,
  rateLimiters.sensitive,
  asyncHandler(controller.resendVerification),
);

router.put(
  '/password',
  authenticate,
  csrfProtection,
  rateLimiters.sensitive,
  validate(changePasswordSchema),
  asyncHandler(controller.changePassword),
);

// --- Two-factor management (authenticated) ---------------------------------

router.post('/2fa/setup', authenticate, csrfProtection, asyncHandler(controller.twoFactorSetup));

router.post(
  '/2fa/enable',
  authenticate,
  csrfProtection,
  validate(twoFactorCodeSchema),
  asyncHandler(controller.twoFactorEnable),
);

router.post(
  '/2fa/disable',
  authenticate,
  csrfProtection,
  validate(twoFactorCodeSchema),
  asyncHandler(controller.twoFactorDisable),
);

// --- Active sessions (authenticated) ---------------------------------------

router.get('/sessions', authenticate, asyncHandler(controller.listSessions));

router.delete(
  '/sessions/:family',
  authenticate,
  csrfProtection,
  asyncHandler(controller.revokeSession),
);

router.post(
  '/sessions/revoke-others',
  authenticate,
  csrfProtection,
  asyncHandler(controller.revokeOtherSessions),
);

export default router;
