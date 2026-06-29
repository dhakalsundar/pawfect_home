import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { csrfProtection } from '../../middleware/csrf.js';
import { ok } from '../../utils/ApiResponse.js';
import * as favoritesService from './favorites.service.js';

const router = Router();

router.use(authenticate);

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().catch(1).default(1),
  limit: z.coerce.number().int().min(1).max(48).catch(24).default(24),
});

router.get(
  '/',
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.query as unknown as { page: number; limit: number };
    const { items, meta } = await favoritesService.listFavorites(req.user!.id, page, limit);
    return ok(res, items, 200, meta);
  }),
);

/** Declared before '/:petId' so "ids" is not treated as a pet id. */
router.get(
  '/ids',
  asyncHandler(async (req, res) => ok(res, await favoritesService.listFavoriteIds(req.user!.id))),
);

router.post(
  '/',
  csrfProtection,
  validate(z.object({ petId: z.string().trim().min(1, 'Pet is required.') })),
  asyncHandler(async (req, res) =>
    ok(res, await favoritesService.addFavorite(req.user!.id, (req.body as { petId: string }).petId)),
  ),
);

/** Idempotent toggle, so the client does not need to know the current state to flip it. */
router.post(
  '/toggle',
  csrfProtection,
  validate(z.object({ petId: z.string().trim().min(1, 'Pet is required.') })),
  asyncHandler(async (req, res) =>
    ok(res, await favoritesService.toggleFavorite(req.user!.id, (req.body as { petId: string }).petId)),
  ),
);

router.delete(
  '/:petId',
  csrfProtection,
  asyncHandler(async (req, res) =>
    ok(res, await favoritesService.removeFavorite(req.user!.id, String(req.params.petId))),
  ),
);

export default router;
