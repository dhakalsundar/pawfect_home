import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { csrfProtection } from '../../middleware/csrf.js';
import { rateLimiters } from '../../middleware/rateLimit.js';
import { ok } from '../../utils/ApiResponse.js';
import * as usersService from './users.service.js';

const router = Router();

router.use(authenticate);

const updateProfileSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(60).optional(),
  phone: z.string().trim().max(24).optional().or(z.literal('')),
  bio: z.string().trim().max(500, 'Bio must be at most 500 characters.').optional().or(z.literal('')),
  avatar: z.object({ url: z.string().url(), publicId: z.string() }).optional(),
  address: z
    .object({
      street: z.string().trim().max(120).optional().or(z.literal('')),
      city: z.string().trim().max(80).optional().or(z.literal('')),
      state: z.string().trim().max(80).optional().or(z.literal('')),
      country: z.string().trim().max(80).optional().or(z.literal('')),
      zip: z.string().trim().max(20).optional().or(z.literal('')),
    })
    .optional(),
});

const updatePreferencesSchema = z.object({
  emailNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  newsletter: z.boolean().optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
});

const deleteAccountSchema = z.object({
  // Typed confirmation rather than a checkbox: deletion is irreversible and should take a moment.
  confirm: z.literal('DELETE', { message: 'Type DELETE to confirm.' }),
  password: z.string().optional(),
});

/**
 * Import whitelist. A previous export is a large document; we accept only its personalisation
 * subset and ignore everything else, so a tampered file cannot set a role, forge donations, etc.
 */
const importSchema = z.object({
  profile: z
    .object({
      name: z.string().trim().min(2).max(60).optional(),
      phone: z.string().trim().max(24).optional(),
      bio: z.string().trim().max(500).optional(),
      address: z
        .object({
          street: z.string().trim().max(120).optional(),
          city: z.string().trim().max(80).optional(),
          state: z.string().trim().max(80).optional(),
          country: z.string().trim().max(80).optional(),
          zip: z.string().trim().max(20).optional(),
        })
        .partial()
        .optional(),
      preferences: z
        .object({
          emailNotifications: z.boolean(),
          pushNotifications: z.boolean(),
          newsletter: z.boolean(),
          theme: z.enum(['light', 'dark', 'system']),
        })
        .partial()
        .optional(),
    })
    .optional(),
});

router.get('/me/stats', asyncHandler(async (req, res) => ok(res, await usersService.getStats(req.user!.id))));

router.put(
  '/me',
  csrfProtection,
  rateLimiters.write,
  validate(updateProfileSchema),
  asyncHandler(async (req, res) => ok(res, await usersService.updateProfile(req.user!.id, req.body))),
);

router.put(
  '/me/preferences',
  csrfProtection,
  rateLimiters.write,
  validate(updatePreferencesSchema),
  asyncHandler(async (req, res) =>
    ok(res, await usersService.updatePreferences(req.user!.id, req.body)),
  ),
);

router.get(
  '/me/export',
  rateLimiters.sensitive,
  asyncHandler(async (req, res) => {
    const data = await usersService.exportUserData(req.user!.id);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="pawfecthome-data-export.json"');
    return res.status(200).send(JSON.stringify(data, null, 2));
  }),
);

router.post(
  '/me/import',
  csrfProtection,
  rateLimiters.write,
  validate(importSchema),
  asyncHandler(async (req, res) => {
    const { profile } = req.body as { profile?: usersService.ImportProfileInput };
    return ok(res, await usersService.importUserData(req.user!.id, profile ?? {}));
  }),
);

router.delete(
  '/me',
  csrfProtection,
  rateLimiters.sensitive,
  validate(deleteAccountSchema),
  asyncHandler(async (req, res) => {
    const { password } = req.body as { password?: string };
    await usersService.deleteAccount(req.user!.id, password);
    return ok(res, { deleted: true });
  }),
);

export default router;
