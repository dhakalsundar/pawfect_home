import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { csrfProtection } from '../../middleware/csrf.js';
import { ok } from '../../utils/ApiResponse.js';
import * as notificationsService from './notifications.service.js';

const router = Router();

router.use(authenticate);

const listQuerySchema = z.object({
  unread: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  page: z.coerce.number().int().positive().catch(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).catch(20).default(20),
});

router.get(
  '/',
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { items, meta } = await notificationsService.listNotifications(
      req.user!.id,
      req.query as unknown as { unread?: boolean; page: number; limit: number },
    );
    return ok(res, items, 200, meta);
  }),
);

/** Declared before '/:id' so "unread-count" is not treated as a notification id. */
router.get(
  '/unread-count',
  asyncHandler(async (req, res) =>
    ok(res, { unreadCount: await notificationsService.getUnreadCount(req.user!.id) }),
  ),
);

router.put(
  '/read-all',
  csrfProtection,
  asyncHandler(async (req, res) => ok(res, await notificationsService.markAllRead(req.user!.id))),
);

router.put(
  '/:id/read',
  csrfProtection,
  asyncHandler(async (req, res) =>
    ok(res, await notificationsService.markRead(req.user!.id, String(req.params.id))),
  ),
);

router.delete(
  '/:id',
  csrfProtection,
  asyncHandler(async (req, res) =>
    ok(res, await notificationsService.removeNotification(req.user!.id, String(req.params.id))),
  ),
);

export default router;
