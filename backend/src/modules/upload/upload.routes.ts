import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { csrfProtection } from '../../middleware/csrf.js';
import { rateLimiters } from '../../middleware/rateLimit.js';
import { ok } from '../../utils/ApiResponse.js';
import { ApiError } from '../../utils/ApiError.js';
import { isUploadFolder, UPLOAD_FOLDERS } from '../../config/cloudinary.js';
import { env } from '../../config/env.js';
import * as uploadService from './upload.service.js';

const router = Router();

// Signing an upload is an authenticated action: an anonymous caller must never be able to obtain
// credentials to write into our Cloudinary account.
router.use(authenticate);

const signatureSchema = z.object({
  folder: z.string().trim().min(1, 'A folder is required.'),
});

router.post(
  '/signature',
  csrfProtection,
  rateLimiters.upload,
  validate(signatureSchema),
  asyncHandler(async (req, res) => {
    const { folder } = req.body as { folder: string };

    if (!isUploadFolder(folder)) {
      throw ApiError.validation(`Unknown upload folder.`, {
        folder: `Must be one of: ${Object.keys(UPLOAD_FOLDERS).join(', ')}.`,
      });
    }

    // Only shelters and admins list pets, so only they may sign uploads into the pets folder.
    if (folder === 'pets' && req.user!.role === 'user') {
      throw ApiError.forbidden('Only shelters can upload pet photos.');
    }
    if (folder === 'shelters' && req.user!.role === 'user') {
      throw ApiError.forbidden('Only shelters can upload shelter images.');
    }

    return ok(res, uploadService.createUploadSignature(folder));
  }),
);

router.post(
  '/delete',
  csrfProtection,
  rateLimiters.upload,
  validate(z.object({ publicId: z.string().trim().min(1) })),
  asyncHandler(async (req, res) => {
    const { publicId } = req.body as { publicId: string };

    // Only assets in our own allow-listed folders can be targeted.
    const exists = await uploadService.verifyAsset(publicId);
    if (!exists) throw ApiError.notFound('Image');

    await uploadService.destroyAsset(publicId);
    return ok(res, { deleted: true });
  }),
);

/**
 * Lets the client decide whether to show the uploader or the URL fallback, without leaking
 * anything: the cloud name is public (it appears in every delivery URL) and the flag is a boolean.
 */
router.get(
  '/config',
  asyncHandler(async (_req, res) =>
    ok(res, {
      enabled: env.isConfigured.cloudinary,
      cloudName: env.CLOUDINARY_CLOUD_NAME ?? null,
      maxFileSizeMb: 5,
      acceptedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
    }),
  ),
);

export default router;
