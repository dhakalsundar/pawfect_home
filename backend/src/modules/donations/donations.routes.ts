import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { authenticate, optionalAuth } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { csrfProtection } from '../../middleware/csrf.js';
import { rateLimiters } from '../../middleware/rateLimit.js';
import { created, ok } from '../../utils/ApiResponse.js';
import * as donationsService from './donations.service.js';

const router = Router();

/**
 * Public totals for the donation banner and donor wall. Identity is masked in the service, so an
 * anonymous donor's name never reaches this response.
 */
router.get(
  '/stats',
  asyncHandler(async (req, res) =>
    ok(res, await donationsService.getDonationStats(req.query.shelterId as string | undefined)),
  ),
);

const checkoutSchema = z.object({
  /**
   * Integer minor units (paisa), validated as such. Accepting rupees and multiplying here would
   * introduce exactly the float error the schema exists to prevent — `19.99 * 100 === 1998.999…`.
   */
  amount: z
    .number()
    .int('Amount must be a whole number of paisa.')
    .min(100, 'The minimum donation is Rs. 1.')
    .max(100_000_00, 'For donations above Rs. 100,000 please contact us directly.'),
  shelterId: z.string().trim().optional(),
  petId: z.string().trim().optional(),
  message: z.string().trim().max(300).optional(),
  isAnonymous: z.boolean().default(false),
  type: z.enum(['one_time', 'monthly']).default('one_time'),
  // How to collect. Defaults to `stripe` so the current donation form (which sends no method yet)
  // behaves exactly as before until Batch 4's UI sends the chosen method explicitly.
  paymentMethod: z.enum(['stripe', 'esewa', 'cod']).default('stripe'),
  // Required for guests; overridden by the session for signed-in donors.
  donorName: z.string().trim().min(2).max(120).optional(),
  donorEmail: z.string().trim().email().optional(),
});

/**
 * Guests may donate, so this is `optionalAuth` rather than `authenticate` — requiring an account
 * to give money would cost donations for no security benefit.
 */
router.post(
  '/checkout',
  optionalAuth,
  rateLimiters.write,
  validate(checkoutSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof checkoutSchema>;

    /**
     * A signed-in donor's identity comes from their account, not from the request body — otherwise
     * anyone could attribute a donation to someone else's name and email, and the receipt would go
     * to the wrong person. The JWT carries only id and role, so the service looks the rest up.
     */
    const identity = await donationsService.resolveDonorIdentity(req.user?.id);
    const donorName = identity?.name ?? input.donorName;
    const donorEmail = identity?.email ?? input.donorEmail;

    if (!donorName || !donorEmail) {
      return res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Please check the highlighted fields.',
          fields: {
            ...(donorName ? {} : { donorName: 'Please tell us your name.' }),
            ...(donorEmail ? {} : { donorEmail: 'We need an email address for your receipt.' }),
          },
        },
      });
    }

    const result = await donationsService.startDonation(
      { ...input, donorName, donorEmail },
      req.user?.id,
    );

    return created(res, result);
  }),
);

/**
 * Verify an eSewa redirect and settle the donation.
 *
 * Public and unauthenticated by design: the signature IS the authentication (the same model as the
 * Stripe webhook), and the browser arriving from eSewa may carry no session. No CSRF for the same
 * reason. Always returns 200 with an `outcome` the result page reads — a bad signature settles
 * nothing and simply reports `invalid_signature`.
 */
router.post(
  '/esewa/verify',
  validate(z.object({ data: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const { data } = req.body as { data: string };
    return ok(res, await donationsService.verifyEsewaCallback(data));
  }),
);

/**
 * Confirm a cash-on-delivery pledge as received. Shelter owner (of the receiving shelter) or admin.
 * CSRF-protected and idempotent — only a pending COD donation transitions.
 */
router.put(
  '/:id/mark-received',
  authenticate,
  authorize('shelter', 'admin'),
  csrfProtection,
  asyncHandler(async (req, res) =>
    ok(
      res,
      await donationsService.settleCodDonation(String(req.params.id), {
        id: req.user!.id,
        role: req.user!.role,
        ...(req.user!.shelterId ? { shelterId: req.user!.shelterId } : {}),
      }),
    ),
  ),
);

const listSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).catch(20).default(20),
  status: z.enum(['pending', 'succeeded', 'failed', 'refunded']).optional(),
});

router.get(
  '/',
  authenticate,
  validate(listSchema, 'query'),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof listSchema>;
    const { items, meta } = await donationsService.listDonations(query, {
      id: req.user!.id,
      role: req.user!.role,
      ...(req.user!.shelterId ? { shelterId: req.user!.shelterId } : {}),
    });
    return ok(res, items, 200, meta);
  }),
);

router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) =>
    ok(
      res,
      await donationsService.getDonation(String(req.params.id), {
        id: req.user!.id,
        role: req.user!.role,
        ...(req.user!.shelterId ? { shelterId: req.user!.shelterId } : {}),
      }),
    ),
  ),
);

export default router;
