import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { csrfProtection } from '../../middleware/csrf.js';
import { rateLimiters } from '../../middleware/rateLimit.js';
import { created, ok } from '../../utils/ApiResponse.js';
import * as petsService from './pets.service.js';
import * as petsMutations from './pets.mutations.js';
import {
  createPetSchema,
  petFacetsQuerySchema,
  petListQuerySchema,
  setStatusSchema,
  updatePetSchema,
  type CreatePetInput,
  type PetListQuery,
  type UpdatePetInput,
} from './pets.validators.js';

const router = Router();

router.get(
  '/',
  validate(petListQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { items, meta } = await petsService.listPets(req.query as unknown as PetListQuery);
    return ok(res, items, 200, meta);
  }),
);

router.get(
  '/featured',
  asyncHandler(async (_req, res) => ok(res, await petsService.getFeaturedPets())),
);

router.get(
  '/facets',
  validate(petFacetsQuerySchema, 'query'),
  asyncHandler(async (req, res) =>
    ok(res, await petsService.getFacets(req.query as never)),
  ),
);

// Declared before '/:slug' so "featured" and "facets" are not swallowed as slugs.
// --- Mutations (shelter/admin) ----------------------------------------------
// Declared before the '/:slug' read route so none of these are matched as slugs.

router.post(
  '/',
  authenticate,
  authorize('shelter', 'admin'),
  csrfProtection,
  rateLimiters.write,
  validate(createPetSchema),
  asyncHandler(async (req, res) =>
    created(res, await petsMutations.createPet(req.user!, req.body as CreatePetInput)),
  ),
);

router.put(
  '/:id',
  authenticate,
  authorize('shelter', 'admin'),
  csrfProtection,
  rateLimiters.write,
  validate(updatePetSchema),
  asyncHandler(async (req, res) =>
    ok(res, await petsMutations.updatePet(req.user!, String(req.params.id), req.body as UpdatePetInput)),
  ),
);

router.patch(
  '/:id/status',
  authenticate,
  authorize('shelter', 'admin'),
  csrfProtection,
  validate(setStatusSchema),
  asyncHandler(async (req, res) =>
    ok(
      res,
      await petsMutations.setPetStatus(
        req.user!,
        String(req.params.id),
        (req.body as { status: 'available' | 'reserved' | 'adopted' | 'archived' }).status,
      ),
    ),
  ),
);

router.delete(
  '/:id',
  authenticate,
  authorize('shelter', 'admin'),
  csrfProtection,
  asyncHandler(async (req, res) => ok(res, await petsMutations.deletePet(req.user!, String(req.params.id)))),
);

// Declared before '/:slug' so "similar" is not swallowed as part of a slug match.
router.get(
  '/:idOrSlug/similar',
  asyncHandler(async (req, res) =>
    ok(res, await petsService.getSimilarPets(String(req.params.idOrSlug))),
  ),
);

router.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    // Express 5 types params as string | string[]; a single-segment route only ever yields a string.
    const pet = await petsService.getPetBySlug(String(req.params.slug));
    petsService.incrementViews(String(pet._id));
    return ok(res, petsService.toPetDetail(pet));
  }),
);

export default router;
