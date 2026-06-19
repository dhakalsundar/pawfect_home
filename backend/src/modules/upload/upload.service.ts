import { getCloudinary, UPLOAD_FOLDERS, type UploadFolder } from '../../config/cloudinary.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';

export interface UploadSignature {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
}

/**
 * Signs a direct browser → Cloudinary upload.
 *
 * The bytes never transit our API, which sidesteps the serverless body limit and keeps the
 * function fast. We only vouch for the request: this user, this folder, right now.
 */
export function createUploadSignature(folder: UploadFolder): UploadSignature {
  const cloudinary = getCloudinary();
  if (!cloudinary) throw ApiError.unavailable('Image uploads');

  const timestamp = Math.round(Date.now() / 1000);
  const targetFolder = UPLOAD_FOLDERS[folder];

  /**
   * Every parameter signed here must be sent verbatim by the client, and Cloudinary rejects the
   * upload if any of them differ. That is what stops a caller taking a signature for `avatars`
   * and uploading into `pets` instead.
   */
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder: targetFolder },
    env.CLOUDINARY_API_SECRET!,
  );

  return {
    signature,
    timestamp,
    apiKey: env.CLOUDINARY_API_KEY!,
    cloudName: env.CLOUDINARY_CLOUD_NAME!,
    folder: targetFolder,
  };
}

/**
 * Confirms an asset actually exists in an allowed folder.
 *
 * Called before persisting image references. Without it, a client could POST any publicId it liked
 * — including one belonging to another user's pet — and have it saved against their own record.
 */
export async function verifyAsset(publicId: string): Promise<boolean> {
  const cloudinary = getCloudinary();
  if (!cloudinary) return false;

  const allowed = Object.values(UPLOAD_FOLDERS);
  if (!allowed.some((folder) => publicId.startsWith(`${folder}/`))) return false;

  try {
    await cloudinary.api.resource(publicId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Removes an asset. Never throws.
 *
 * Deletion cleanup runs alongside a database change that has already succeeded; a Cloudinary
 * hiccup must not fail the user's action. Orphans are swept up by the job below.
 */
export async function destroyAsset(publicId: string): Promise<void> {
  const cloudinary = getCloudinary();
  if (!cloudinary || !publicId) return;

  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    logger.error({ err: error, publicId }, 'Failed to delete Cloudinary asset');
  }
}

export async function destroyAssets(publicIds: (string | undefined)[]): Promise<void> {
  await Promise.all(publicIds.filter((id): id is string => Boolean(id)).map(destroyAsset));
}
