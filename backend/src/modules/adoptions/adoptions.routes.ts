import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { csrfProtection } from '../../middleware/csrf.js';
import { rateLimiters } from '../../middleware/rateLimit.js';
import { created, ok } from '../../utils/ApiResponse.js';
import * as adoptionsService from './adoptions.service.js';
import {
  listApplicationsQuerySchema,
  scheduleMeetingSchema,
  submitApplicationSchema,
  updateStatusSchema,
  withdrawSchema,
  type ListApplicationsQuery,
  type SubmitApplicationInput,
  type UpdateStatusInput,
} from './adoptions.validators.js';

const router = Router();

// Every route here needs a session; none of this is public.
router.use(authenticate);

router.post(
  '/',
  csrfProtection,
  rateLimiters.write,
  validate(submitApplicationSchema),
  asyncHandler(async (req, res) =>
    created(res, await adoptionsService.submitApplication(req.user!, req.body as SubmitApplicationInput)),
  ),
);

router.get(
  '/',
  validate(listApplicationsQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { items, meta } = await adoptionsService.listApplications(
      req.user!,
      req.query as unknown as ListApplicationsQuery,
    );
    return ok(res, items, 200, meta);
  }),
);

/** Declared before '/:id' so "for-pet" is not matched as an application id. */
router.get(
  '/for-pet/:petId',
  asyncHandler(async (req, res) =>
    ok(res, await adoptionsService.getApplicationForPet(req.user!.id, String(req.params.petId))),
  ),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) =>
    ok(res, await adoptionsService.getApplication(req.user!, String(req.params.id))),
  ),
);

router.put(
  '/:id/status',
  csrfProtection,
  authorize('shelter', 'admin'),
  validate(updateStatusSchema),
  asyncHandler(async (req, res) =>
    ok(
      res,
      await adoptionsService.updateStatus(req.user!, String(req.params.id), req.body as UpdateStatusInput),
    ),
  ),
);

router.put(
  '/:id/withdraw',
  csrfProtection,
  validate(withdrawSchema),
  asyncHandler(async (req, res) =>
    ok(
      res,
      await adoptionsService.withdrawApplication(
        req.user!,
        String(req.params.id),
        (req.body as { reason?: string }).reason,
      ),
    ),
  ),
);

router.post(
  '/:id/schedule',
  csrfProtection,
  authorize('shelter', 'admin'),
  validate(scheduleMeetingSchema),
  asyncHandler(async (req, res) => {
    const { meetingScheduledAt, note } = req.body as { meetingScheduledAt: Date; note?: string };
    return ok(
      res,
      await adoptionsService.scheduleMeeting(req.user!, String(req.params.id), meetingScheduledAt, note),
    );
  }),
);

export default router;
