import { ErrorCode, type ApiBody, type PaginationMeta } from '@/types/api';
import { ApiError } from './api-error';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api/v1';

export interface RequestOptions extends Omit<RequestInit, 'body' | 'method'> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Appended as a query string; undefined and null entries are dropped. */
  params?: Record<string, string | number | boolean | undefined | null>;
  /** Skip the refresh-and-retry cycle. Used by the refresh call itself. */
  skipAuthRetry?: boolean;
}

export interface ApiResult<T> {
  data: T;
  meta?: PaginationMeta;
}

const CSRF_COOKIE = 'ph_csrf';
const CSRF_HEADER = 'X-CSRF-Token';
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Reads the CSRF cookie the API set. It is deliberately not httpOnly — the double-submit pattern
 * requires the client to echo it back in a header, which only same-origin JavaScript can do.
 */
function readCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function buildUrl(path: string, params?: RequestOptions['params']): string {
  const url = new URL(`${API_URL}${path.startsWith('/') ? path : `/${path}`}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

/**
 * Single-flight refresh.
 *
 * Without this, a page that fires six parallel requests on mount would, on an expired access token,
 * trigger six concurrent /auth/refresh calls. Since refresh tokens ROTATE, five of those would
 * present an already-rotated token — which the backend treats as theft and responds to by revoking
 * the entire token family, logging the user out. So: at most one refresh in flight, everyone else
 * awaits the same promise.
 */
let refreshPromise: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  refreshPromise ??= (async () => {
    try {
      const response = await fetch(buildUrl('/auth/refresh'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      // Cleared on the next tick so concurrent callers all observe the same settled promise.
      setTimeout(() => {
        refreshPromise = null;
      }, 0);
    }
  })();

  return refreshPromise;
}

/** Called when refresh fails and the session is genuinely gone. Set by AuthProvider in Batch 2. */
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

async function parseBody<T>(response: Response): Promise<ApiBody<T> | null> {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as ApiBody<T>;
  } catch {
    // A proxy error page, a gateway timeout, an HTML 502 — anything that isn't our envelope.
    return null;
  }
}

/**
 * The browser-side API client. Every request carries cookies; nothing here reads or writes tokens
 * directly, because they are httpOnly and invisible to JavaScript by design.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const { method = 'GET', body, params, skipAuthRetry = false, headers, ...rest } = options;

  const csrfToken = UNSAFE_METHODS.has(method) ? readCsrfToken() : null;

  const init: RequestInit = {
    ...rest,
    method,
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(csrfToken ? { [CSRF_HEADER]: csrfToken } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };

  let response: Response;
  try {
    response = await fetch(buildUrl(path, params), init);
  } catch {
    throw ApiError.network();
  }

  const parsed = await parseBody<T>(response);

  if (response.ok && parsed?.success) {
    return { data: parsed.data, ...(parsed.meta ? { meta: parsed.meta } : {}) };
  }

  if (response.ok && parsed === null) {
    return { data: undefined as T };
  }

  const errorPayload = parsed && !parsed.success ? parsed.error : null;
  const code = errorPayload?.code ?? ErrorCode.INTERNAL;

  // Access token expired — refresh once, then replay the original request.
  if (response.status === 401 && code === ErrorCode.TOKEN_EXPIRED && !skipAuthRetry) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return request<T>(path, { ...options, skipAuthRetry: true });
    }
    onSessionExpired?.();
  }

  throw new ApiError(
    response.status,
    code,
    errorPayload?.message ?? 'Something went wrong. Please try again.',
    errorPayload?.fields,
  );
}

/** Convenience wrappers so call sites read as `http.get('/pets', { params })`. */
export const http = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'POST', body }),

  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PUT', body }),

  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PATCH', body }),

  /**
   * DELETE accepts a body. Account deletion sends a typed confirmation and a password, which must
   * not travel in a query string where proxies and server logs would record them.
   */
  delete: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'DELETE', ...(body !== undefined ? { body } : {}) }),
};
