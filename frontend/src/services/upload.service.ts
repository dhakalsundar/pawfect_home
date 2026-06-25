import { http } from './http';

export interface UploadSignature {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
}

export interface UploadConfig {
  enabled: boolean;
  cloudName: string | null;
  maxFileSizeMb: number;
  acceptedTypes: string[];
}

export interface UploadedImage {
  url: string;
  publicId: string;
  width: number;
  height: number;
}

export type UploadFolder = 'pets' | 'avatars' | 'shelters';

/** Kept in step with the backend's own limits, which are authoritative. */
export const MAX_FILE_SIZE_MB = 5;
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

/**
 * Client-side validation.
 *
 * Purely for immediate feedback — the server enforces the same rules, and Cloudinary enforces its
 * own. Rejecting a 40 MB file here saves the user a long upload that would fail anyway.
 */
export function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return `${file.name} is not a supported image (JPEG, PNG, WebP or AVIF).`;
  }
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    const sizeMb = (file.size / 1024 / 1024).toFixed(1);
    return `${file.name} is ${sizeMb} MB — the limit is ${MAX_FILE_SIZE_MB} MB.`;
  }
  return null;
}

export const uploadService = {
  config: () => http.get<UploadConfig>('/upload/config').then((r) => r.data),

  signature: (folder: UploadFolder) =>
    http.post<UploadSignature>('/upload/signature', { folder }).then((r) => r.data),

  deleteAsset: (publicId: string) =>
    http.post<{ deleted: boolean }>('/upload/delete', { publicId }).then((r) => r.data),
};

/**
 * Uploads straight to Cloudinary with progress.
 *
 * XMLHttpRequest rather than fetch: fetch still has no upload-progress events, and a multi-megabyte
 * photo with no feedback feels broken. The bytes bypass our API entirely — we only signed the
 * request.
 */
export function uploadToCloudinary(
  file: File,
  signature: UploadSignature,
  onProgress?: (percent: number) => void,
): Promise<UploadedImage> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    form.append('api_key', signature.apiKey);
    form.append('timestamp', String(signature.timestamp));
    form.append('signature', signature.signature);
    // Must match the signed value exactly, or Cloudinary rejects the upload.
    form.append('folder', signature.folder);

    const request = new XMLHttpRequest();
    request.open('POST', `https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`);

    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        try {
          const data = JSON.parse(request.responseText) as {
            secure_url: string;
            public_id: string;
            width: number;
            height: number;
          };
          resolve({
            url: data.secure_url,
            publicId: data.public_id,
            width: data.width,
            height: data.height,
          });
        } catch {
          reject(new Error('Cloudinary returned a response we could not read.'));
        }
        return;
      }

      // Surface Cloudinary's own message where it gives one — it is usually specific.
      let message = `Upload failed (${request.status}).`;
      try {
        const parsed = JSON.parse(request.responseText) as { error?: { message?: string } };
        if (parsed.error?.message) message = parsed.error.message;
      } catch {
        // Keep the generic message.
      }
      reject(new Error(message));
    });

    request.addEventListener('error', () => reject(new Error('Network error during upload.')));
    request.addEventListener('abort', () => reject(new Error('Upload cancelled.')));

    request.send(form);
  });
}
