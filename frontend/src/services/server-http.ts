import 'server-only';

import { cookies } from 'next/headers';
import { ErrorCode, type ApiBody, type PaginationMeta } from '@/types/api';
import { ApiError } from './api-error';

/**
 * Server-side API base. Kept separate from NEXT_PUBLIC_API_URL because in production the two often
 * differ: the browser reaches the API over its public hostname, while the Next.js server can reach
 * it over a private network address — faster, and it never leaves the datacentre.
 */
const API_URL =
  process.env.API_URL_INTERNAL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:5000/api/v1';

export interface ServerRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined | null>;
  /** Next.js fetch cache controls — `revalidate` seconds and cache tags. */
  next?: { revalidate?: number | false; tags?: string[] };
  cache?: RequestCache;
  /** Forward the caller's session cookies. Off for genuinely public, cacheable data. */
  withAuth?: boolean;
}

export interface ServerResult<T> {
  data: T;
  meta?: PaginationMeta;
}

function buildUrl(path: string, params?: ServerRequestOptions['params']): string {
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
 * The Server Component API client.
 *
 * Two things it deliberately does NOT do, both of which the browser client does:
 *  - retry on token expiry. A Server Component cannot set cookies on the response, so it cannot
 *    persist a refreshed token. Expiry here surfaces as an auth error and the protected layout
 *    redirects to login, where the browser client takes over.
 *  - swallow errors. A failed server fetch should hit the segment's error.tsx, not render an
 *    empty page that looks like "no results".
 */
export async function serverRequest<T>(
  path: string,
  options: ServerRequestOptions = {},
): Promise<ServerResult<T>> {
  const { method = 'GET', body, params, next, cache, withAuth = true } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (withAuth) {
    // Forward the incoming request's cookies so SSR renders as the signed-in user.
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    if (cookieHeader) headers.Cookie = cookieHeader;
  }

  const init: RequestInit & { next?: ServerRequestOptions['next'] } = {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(cache ? { cache } : {}),
    ...(next ? { next } : {}),
  };

  // Authenticated responses are per-user and must never enter the shared data cache.
  if (withAuth && !next && !cache) {
    init.cache = 'no-store';
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, params), init);
  } catch {
    throw ApiError.network();
  }

  if (response.status === 204) {
    return { data: undefined as T };
  }

  let parsed: ApiBody<T> | null = null;
  const text = await response.text();
  if (text) {
    try {
      parsed = JSON.parse(text) as ApiBody<T>;
    } catch {
      parsed = null;
    }
  }

  if (response.ok && parsed?.success) {
    return { data: parsed.data, ...(parsed.meta ? { meta: parsed.meta } : {}) };
  }

  const errorPayload = parsed && !parsed.success ? parsed.error : null;
  throw new ApiError(
    response.status,
    errorPayload?.code ?? ErrorCode.INTERNAL,
    errorPayload?.message ?? 'Something went wrong. Please try again.',
    errorPayload?.fields,
  );
}

export const serverHttp = {
  get: <T>(path: string, options?: Omit<ServerRequestOptions, 'method' | 'body'>) =>
    serverRequest<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown, options?: Omit<ServerRequestOptions, 'method' | 'body'>) =>
    serverRequest<T>(path, { ...options, method: 'POST', body }),
};

/**
 * For data a page can render without — a stats strip, a testimonial block. Returns null instead of
 * throwing, so one flaky widget cannot blank out an otherwise healthy page.
 */
export async function serverHttpSafe<T>(
  path: string,
  options?: Omit<ServerRequestOptions, 'method' | 'body'>,
): Promise<T | null> {
  try {
    const { data } = await serverRequest<T>(path, { ...options, method: 'GET' });
    return data;
  } catch {
    return null;
  }
}
