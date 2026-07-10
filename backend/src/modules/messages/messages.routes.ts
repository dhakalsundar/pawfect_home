import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { csrfProtection } from '../../middleware/csrf.js';
import { rateLimiters } from '../../middleware/rateLimit.js';
import { created, ok } from '../../utils/ApiResponse.js';
import * as messagesService from './messages.service.js';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => ok(res, await messagesService.listConversations(req.user!.id))),
);

/** Declared before '/:id' so "unread-count" is not treated as a conversation id. */
router.get(
  '/unread-count',
  asyncHandler(async (req, res) =>
    ok(res, { unreadCount: await messagesService.getUnreadTotal(req.user!.id) }),
  ),
);

const startSchema = z
  .object({
    recipientId: z.string().trim().optional(),
    petId: z.string().trim().optional(),
  })
  // Either name the recipient directly, or name a pet and let the API resolve its shelter owner.
  .refine((data) => data.recipientId ?? data.petId, {
    message: 'Provide a recipient or a pet.',
  });

router.post(
  '/',
  csrfProtection,
  rateLimiters.write,
  validate(startSchema),
  asyncHandler(async (req, res) => {
    const { recipientId, petId } = req.body as { recipientId?: string; petId?: string };
    const resolved = recipientId ?? (await messagesService.resolvePetRecipient(petId!));
    return created(res, await messagesService.startConversation(req.user!.id, resolved, petId));
  }),
);

const messagesQuerySchema = z.object({
  before: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(50).catch(30).default(30),
});

router.get(
  '/:id/messages',
  validate(messagesQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { before, limit } = req.query as unknown as { before?: string; limit: number };
    return ok(
      res,
      await messagesService.listMessages(String(req.params.id), req.user!.id, before, limit),
    );
  }),
);

router.post(
  '/:id/messages',
  csrfProtection,
  rateLimiters.write,
  validate(z.object({ body: z.string().trim().min(1, 'Write a message.').max(2000) })),
  asyncHandler(async (req, res) =>
    created(
      res,
      await messagesService.sendMessage(
        String(req.params.id),
        req.user!.id,
        (req.body as { body: string }).body,
      ),
    ),
  ),
);

router.put(
  '/:id/read',
  csrfProtection,
  asyncHandler(async (req, res) =>
    ok(res, await messagesService.markConversationRead(String(req.params.id), req.user!.id)),
  ),
);

export default router;
