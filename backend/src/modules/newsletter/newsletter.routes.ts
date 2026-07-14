import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { rateLimiters } from '../../middleware/rateLimit.js';
import { ok } from '../../utils/ApiResponse.js';
import * as newsletterService from './newsletter.service.js';

const router = Router();

const subscribeSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Email is required.')
    .email('Please enter a valid email address.')
    .max(254, 'Email is too long.'),
  source: z.string().max(40).optional(),
  /**
   * Honeypot. Real users never see this field, so anything in it is a bot.
   *
   * It must accept ANY value here. Validating it as empty would return a 422 naming the field —
   * which tells the bot precisely which input gave it away and teaches it to skip that one next
   * time. The route silently drops filled submissions and returns the normal success response.
   */
  website: z.string().max(200).optional(),
});

const tokenSchema = z.object({ token: z.string().min(1) });

router.post(
  '/',
  rateLimiters.sensitive,
  validate(subscribeSchema),
  asyncHandler(async (req, res) => {
    const { email, source, website } = req.body as z.infer<typeof subscribeSchema>;

    if (!website) {
      await newsletterService.subscribe(email, source ?? 'homepage');
    }

    return ok(res, {
      subscribed: true,
      message: 'Thanks! Check your inbox to confirm your subscription.',
    });
  }),
);

router.get(
  '/confirm',
  validate(tokenSchema, 'query'),
  asyncHandler(async (req, res) => {
    await newsletterService.confirm((req.query as { token: string }).token);
    return ok(res, { confirmed: true });
  }),
);

router.get(
  '/unsubscribe',
  validate(tokenSchema, 'query'),
  asyncHandler(async (req, res) => {
    await newsletterService.unsubscribe((req.query as { token: string }).token);
    return ok(res, { unsubscribed: true });
  }),
);

export default router;
