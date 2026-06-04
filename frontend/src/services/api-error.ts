import { ErrorCode, type ErrorCodeValue, type FieldErrors } from '@/types/api';

/**
 * The single error type every service method throws. UI code switches on `.code` rather than
 * parsing messages, and forms read `.fields` straight into react-hook-form's setError.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCodeValue;
  readonly fields?: FieldErrors;

  constructor(status: number, code: ErrorCodeValue, message: string, fields?: FieldErrors) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    if (fields) this.fields = fields;
  }

  get isAuthError(): boolean {
    return this.code === ErrorCode.UNAUTHENTICATED || this.code === ErrorCode.TOKEN_EXPIRED;
  }

  get isValidationError(): boolean {
    return this.code === ErrorCode.VALIDATION_ERROR;
  }

  /**
   * Network failures and non-JSON responses land here — a backend that is down, a DNS failure,
   * or a proxy returning an HTML error page. Presented as a 503 so callers handle it uniformly.
   */
  static network(message = 'Could not reach the server. Check your connection and try again.') {
    return new ApiError(503, ErrorCode.SERVICE_UNAVAILABLE, message);
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
