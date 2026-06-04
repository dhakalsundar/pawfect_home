/**
 * Error codes the frontend switches on. Kept as a const object rather than a TS enum so the values
 * survive into the shared DTO types verbatim.
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

/** Field-level messages, keyed by the request-body path that failed. */
export type FieldErrors = Record<string, string>;

/**
 * An error that is safe to show the client. Anything thrown that is NOT an ApiError is treated as
 * an unexpected bug by the error handler: logged in full, reported as a generic 500.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCodeValue;
  readonly fields?: FieldErrors;
  readonly isOperational = true;

  constructor(
    statusCode: number,
    code: ErrorCodeValue,
    message: string,
    fields?: FieldErrors,
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    if (fields) this.fields = fields;
    Error.captureStackTrace?.(this, ApiError);
  }

  // --- Shorthand constructors, so call sites read as prose ---------------

  static unauthenticated(message = 'You must be signed in to do that.') {
    return new ApiError(401, ErrorCode.UNAUTHENTICATED, message);
  }

  static tokenExpired(message = 'Session expired.') {
    return new ApiError(401, ErrorCode.TOKEN_EXPIRED, message);
  }

  static forbidden(message = 'You do not have permission to do that.') {
    return new ApiError(403, ErrorCode.FORBIDDEN, message);
  }

  static notFound(resource = 'Resource') {
    return new ApiError(404, ErrorCode.NOT_FOUND, `${resource} not found.`);
  }

  static conflict(message: string) {
    return new ApiError(409, ErrorCode.CONFLICT, message);
  }

  static validation(message = 'Please check the highlighted fields.', fields?: FieldErrors) {
    return new ApiError(422, ErrorCode.VALIDATION_ERROR, message, fields);
  }

  static rateLimited(message = 'Too many requests. Please try again shortly.') {
    return new ApiError(429, ErrorCode.RATE_LIMITED, message);
  }

  /**
   * The account is temporarily locked after too many failed logins. 429 with its own code so the
   * client can show a countdown rather than the generic "wrong password" message. `retryAfterSec`
   * rides in `fields` so the existing envelope carries it without a schema change.
   */
  static accountLocked(retryAfterSec: number, message = 'Account temporarily locked.') {
    return new ApiError(429, ErrorCode.ACCOUNT_LOCKED, message, {
      retryAfter: String(retryAfterSec),
    });
  }

  /** A CAPTCHA is required (or the supplied answer was wrong). Prompts the client to fetch one. */
  static captchaRequired(message = 'Please complete the verification challenge.') {
    return new ApiError(403, ErrorCode.CAPTCHA_REQUIRED, message);
  }

  static payment(message: string) {
    return new ApiError(402, ErrorCode.PAYMENT_ERROR, message);
  }

  /** Used when an optional integration (Stripe, Cloudinary, SMTP) has not been configured. */
  static unavailable(service: string) {
    return new ApiError(
      503,
      ErrorCode.SERVICE_UNAVAILABLE,
      `${service} is not configured on this server.`,
    );
  }

  /** Same 503, but for cases where the caller has a better sentence than "X is not configured". */
  static serviceUnavailable(message: string) {
    return new ApiError(503, ErrorCode.SERVICE_UNAVAILABLE, message);
  }

  static internal(message = 'Something went wrong on our end.') {
    return new ApiError(500, ErrorCode.INTERNAL, message);
  }
}
