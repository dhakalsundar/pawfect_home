/**
 * Shared API contract types.
 *
 * From Batch 2 this file becomes generated output — `backend/src/types/api.ts` is the source of
 * truth and `npm run sync:types` copies it here. Until the backend has DTOs worth syncing, the
 * envelope types below are maintained by hand and must stay identical to
 * `backend/src/utils/ApiResponse.ts` and `backend/src/utils/ApiError.ts`.
 */

export const ErrorCode = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  CAPTCHA_REQUIRED: 'CAPTCHA_REQUIRED',
  PAYMENT_ERROR: 'PAYMENT_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export type FieldErrors = Record<string, string>;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface SuccessBody<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ErrorBody {
  success: false;
  error: {
    code: ErrorCodeValue;
    message: string;
    fields?: FieldErrors;
  };
}

export type ApiBody<T> = SuccessBody<T> | ErrorBody;

/** A list response with its pagination block preserved. */
export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

// --- Domain types -----------------------------------------------------------
// Added batch by batch as the backend grows. Batch 2 brings User; Batch 4 Pet
// and Shelter; and so on.

export type UserRole = 'user' | 'shelter' | 'admin';
export type UserStatus = 'active' | 'suspended' | 'banned';

export interface HealthReport {
  status: 'ok' | 'degraded';
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
  version: string;
  services: Record<string, 'configured' | 'not_configured'>;
}
