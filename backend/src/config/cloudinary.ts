import { v2 as cloudinary } from 'cloudinary';
import { env } from './env.js';
import { logger } from './logger.js';

let configured = false;

/**
 * Returns the configured SDK, or null when credentials are absent.
 *
 * Callers check for null and surface a clear 503 rather than letting the SDK throw something
 * opaque — the app must remain fully usable without Cloudinary until it is wired up.
 */
export function getCloudinary(): typeof cloudinary | null {
  if (!env.isConfigured.cloudinary) return null;

  if (!configured) {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
    logger.info('Cloudinary configured.');
  }

  return cloudinary;
}

/**
 * Folders the API will sign uploads into.
 *
 * An allow-list, not free text: without it a caller could request a signature for any path in the
 * account — including one used by another feature — and upload whatever they liked there.
 */
export const UPLOAD_FOLDERS = {
  pets: 'pawfecthome/pets',
  avatars: 'pawfecthome/avatars',
  shelters: 'pawfecthome/shelters',
} as const;

export type UploadFolder = keyof typeof UPLOAD_FOLDERS;

export function isUploadFolder(value: string): value is UploadFolder {
  return value in UPLOAD_FOLDERS;
}
