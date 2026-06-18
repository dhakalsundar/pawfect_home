import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { ok } from '../../utils/ApiResponse.js';
import { shelterPetsQuerySchema, type ShelterPetsQuery } from '../pets/pets.validators.js';
import * as sheltersService from './shelters.service.js';

const router = Router();

/**
 * Everything under /shelters/me is the signed-in shelter's own data — pending listings, archived
 * pets, analytics. Public shelter profiles are a separate concern and arrive with Batch 9.
 */
/**
 * Public routes are declared BEFORE the '/me' guard so they stay unauthenticated — and '/:slug'
 * is declared last, so it never swallows '/me'.
 */
const publicListSchema = z.object({
  q: z.string().trim().max(100).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  sort: z.enum(['rating', 'pets', 'name']).catch('rating').default('rating'),
  page: z.coerce.number().int().min(1).catch(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).catch(12).default(12),
});

router.get(
  '/',
  validate(publicListSchema, 'query'),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof publicListSchema>;
    const { items, meta } = await sheltersService.listPublicShelters(query);
    return ok(res, items, 200, meta);
  }),
);

router.use('/me', authenticate, authorize('shelter', 'admin'));

router.get(
  '/me/pets',
  validate(shelterPetsQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const shelterId = await sheltersService.resolveShelterId(req.user!);
    const { items, meta } = await sheltersService.listShelterPets(
      shelterId,
      req.query as unknown as ShelterPetsQuery,
    );
    return ok(res, items, 200, meta);
  }),
);

router.get(
  '/me/analytics',
  asyncHandler(async (req, res) => {
    const shelterId = await sheltersService.resolveShelterId(req.user!);
    return ok(res, await sheltersService.getShelterAnalytics(shelterId));
  }),
);

/** Declared last: a bare '/:slug' above would capture '/me'. */
router.get(
  '/:slug',
  asyncHandler(async (req, res) =>
    ok(res, await sheltersService.getPublicShelter(String(req.params.slug))),
  ),
);

export default router;
