import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { authenticate, optionalAuth } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { csrfProtection } from '../../middleware/csrf.js';
import { rateLimiters } from '../../middleware/rateLimit.js';
import { created, ok } from '../../utils/ApiResponse.js';
import * as reviewsService from './reviews.service.js';
import { resolveShelterId } from '../shelters/shelters.service.js';

const router = Router();

const listSchema = z.object({
  shelterId: z.string().trim().optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  page: z.coerce.number().int().min(1).catch(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).catch(10).default(10),
  sort: z.enum(['recent', 'helpful', 'rating_high', 'rating_low']).catch('recent').default('recent'),
});

/** Public — approved reviews only. `optionalAuth` so a signed-in reader sees their own votes. */
router.get(
  '/',
  optionalAuth,
  validate(listSchema, 'query'),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof listSchema>;
    const { items, meta } = await reviewsService.listReviews(query, req.user?.id);
    return ok(res, items, 200, meta);
  }),
);

/** The distribution bars. Public. */
router.get(
  '/breakdown/:shelterId',
  asyncHandler(async (req, res) =>
    ok(res, await reviewsService.getRatingBreakdown(String(req.params.shelterId))),
  ),
);

/** Declared before '/:id' routes so "mine" is never parsed as a review id. */
router.get(
  '/mine',
  authenticate,
  validate(z.object({
    page: z.coerce.number().int().min(1).catch(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).catch(20).default(20),
  }), 'query'),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.query as unknown as { page: number; limit: number };
    const { items, meta } = await reviewsService.listMyReviews(req.user!.id, page, limit);
    return ok(res, items, 200, meta);
  }),
);

router.get(
  '/mine/:shelterId',
  authenticate,
  asyncHandler(async (req, res) =>
    ok(res, await reviewsService.getMyReview(String(req.params.shelterId), req.user!.id)),
  ),
);

/**
 * A shelter owner's own reviews, resolved from the session.
 *
 * The shelter id is never taken from the client here: the owner already has exactly one shelter,
 * so asking them to name it would only create a parameter worth tampering with.
 */
router.get(
  '/shelter/mine',
  authenticate,
  authorize('shelter', 'admin'),
  validate(z.object({
    page: z.coerce.number().int().min(1).catch(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).catch(20).default(20),
  }), 'query'),
  asyncHandler(async (req, res) => {
    const shelterId = await resolveShelterId(req.user!);
    const { page, limit } = req.query as unknown as { page: number; limit: number };
    const { items, meta } = await reviewsService.listReviews(
      { shelterId: String(shelterId), page, limit, sort: 'recent' },
      req.user!.id,
    );
    return ok(res, items, 200, meta);
  }),
);

/** The rating breakdown for the caller's own shelter. */
router.get(
  '/shelter/mine/breakdown',
  authenticate,
  authorize('shelter', 'admin'),
  asyncHandler(async (req, res) => {
    const shelterId = await resolveShelterId(req.user!);
    return ok(res, await reviewsService.getRatingBreakdown(String(shelterId)));
  }),
);

/** The moderation queue. Admin only — and above '/:id' for the same reason as '/mine'. */
router.get(
  '/moderation/queue',
  authenticate,
  authorize('admin'),
  validate(z.object({
    status: z.enum(['pending', 'approved', 'rejected']).optional(),
    page: z.coerce.number().int().min(1).catch(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).catch(20).default(20),
  }), 'query'),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as { status?: 'pending' | 'approved' | 'rejected'; page: number; limit: number };
    const { items, meta } = await reviewsService.listForModeration(query);
    return ok(res, items, 200, meta);
  }),
);

const createSchema = z.object({
  shelterId: z.string().trim().min(1),
  rating: z.number().int('Please choose a whole number of stars.').min(1).max(5),
  title: z.string().trim().max(100).optional(),
  comment: z
    .string()
    .trim()
    .min(10, 'Please write at least 10 characters.')
    .max(1000, 'Please keep it under 1000 characters.'),
  images: z
    .array(z.object({ url: z.string().url(), publicId: z.string().optional() }))
    .max(4)
    .optional(),
});

router.post(
  '/',
  authenticate,
  csrfProtection,
  rateLimiters.write,
  validate(createSchema),
  asyncHandler(async (req, res) =>
    created(res, await reviewsService.createReview(req.body as z.infer<typeof createSchema>, req.user!.id)),
  ),
);

const updateSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  title: z.string().trim().max(100).optional(),
  comment: z.string().trim().min(10).max(1000).optional(),
});

router.put(
  '/:id',
  authenticate,
  csrfProtection,
  validate(updateSchema),
  asyncHandler(async (req, res) =>
    ok(
      res,
      await reviewsService.updateReview(
        String(req.params.id),
        req.user!.id,
        req.body as z.infer<typeof updateSchema>,
      ),
    ),
  ),
);

router.delete(
  '/:id',
  authenticate,
  csrfProtection,
  asyncHandler(async (req, res) =>
    ok(
      res,
      await reviewsService.deleteReview(String(req.params.id), {
        id: req.user!.id,
        role: req.user!.role,
      }),
    ),
  ),
);

router.post(
  '/:id/helpful',
  authenticate,
  csrfProtection,
  asyncHandler(async (req, res) =>
    ok(res, await reviewsService.toggleHelpful(String(req.params.id), req.user!.id)),
  ),
);

router.post(
  '/:id/reply',
  authenticate,
  authorize('shelter', 'admin'),
  csrfProtection,
  validate(z.object({ body: z.string().trim().min(1).max(1000) })),
  asyncHandler(async (req, res) =>
    ok(
      res,
      await reviewsService.replyToReview(String(req.params.id), (req.body as { body: string }).body, {
        id: req.user!.id,
        ...(req.user!.shelterId ? { shelterId: req.user!.shelterId } : {}),
      }),
    ),
  ),
);

router.put(
  '/:id/moderate',
  authenticate,
  authorize('admin'),
  csrfProtection,
  validate(z.object({
    status: z.enum(['approved', 'rejected']),
    note: z.string().trim().max(500).optional(),
  })),
  asyncHandler(async (req, res) => {
    const { status, note } = req.body as { status: 'approved' | 'rejected'; note?: string };
    return ok(res, await reviewsService.moderateReview(String(req.params.id), status, req.user!.id, note));
  }),
);

export default router;
