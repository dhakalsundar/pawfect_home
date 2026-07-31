import { NextResponse, type NextRequest } from 'next/server';

const ACCESS_COOKIE = 'ph_access';

/** Route prefixes that require a session. Role checks happen in the layouts and the API. */
const PROTECTED_PREFIXES = ['/dashboard', '/shelter', '/admin', '/adopt'];

/** Signed-in users have no business on these. */
const AUTH_ONLY_PREFIXES = ['/login', '/register', '/forgot-password'];

/**
 * A UX redirect gate — deliberately NOT a security boundary.
 *
 * Renamed from `middleware.ts` in Batch 15: Next 16 superseded the `middleware` file convention
 * with `proxy`, and the old name logged a deprecation warning on every build. The redirect
 * behaviour is unchanged and re-verified by tests/auth-frontend.ps1.
 *
 * The frontend does not hold JWT_ACCESS_SECRET, so it cannot verify a signature; all it can see is
 * whether a cookie is present. A forged cookie sails past this and is then rejected by the API,
 * which is the real boundary (see docs/04-ROLES-PERMISSIONS.md). The point here is simply to avoid
 * rendering a dashboard for someone who is obviously signed out.
 */
/**
 * Prefix match that respects path-segment boundaries.
 *
 * A plain `startsWith` is wrong here and bit us the moment the public `/shelters` directory was
 * added in Batch 15: it starts with the protected `/shelter` prefix, so the whole public shelter
 * listing redirected to login. `/shelter` must match `/shelter` and `/shelter/pets`, but never
 * `/shelters`.
 */
function matchesSegment(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

const isProd = process.env.NODE_ENV === 'production';

/** Origin of the API (for connect-src). NEXT_PUBLIC_API_URL is like http://host/api/v1. */
function apiOrigin(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api/v1').origin;
  } catch {
    return 'http://localhost:5000';
  }
}

/**
 * The security response headers. These are attacks against rendered HTML, so they matter more on
 * the pages than on the JSON API (which sets its own via helmet).
 *
 * The strict, nonce-based CSP is applied in PRODUCTION ONLY: the Next dev server needs
 * 'unsafe-eval'/'unsafe-inline' for hot reload, so a strict policy there would break HMR and prove
 * nothing (see docs/CLAUDE.md). The non-CSP headers are safe everywhere and always set.
 */
function applySecurityHeaders(response: NextResponse, nonce: string): void {
  const h = response.headers;
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('X-Frame-Options', 'DENY');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  );

  if (isProd) {
    const api = apiOrigin();
    const ws = api.replace(/^http/, 'ws');
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}'`,
      // Tailwind/Next inject inline <style>; a nonce on styles is impractical and inline CSS is not
      // a script-execution vector, so 'unsafe-inline' is accepted here only for styles.
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      `connect-src 'self' ${api} ${ws}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      'upgrade-insecure-requests',
    ].join('; ');
    h.set('Content-Security-Policy', csp);
    h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(ACCESS_COOKIE)?.value);

  // A fresh nonce per request. In production Next stamps it onto its own inline scripts when it is
  // passed through the request headers, so an injected inline script (which has no nonce) cannot run.
  const nonce = btoa(crypto.randomUUID());

  if (!hasSession && PROTECTED_PREFIXES.some((p) => matchesSegment(pathname, p))) {
    const loginUrl = new URL('/login', request.url);
    // Preserve where they were going, so login can send them back there.
    loginUrl.searchParams.set('callbackUrl', `${pathname}${search}`);
    const redirect = NextResponse.redirect(loginUrl);
    applySecurityHeaders(redirect, nonce);
    return redirect;
  }

  if (hasSession && AUTH_ONLY_PREFIXES.some((p) => matchesSegment(pathname, p))) {
    const redirect = NextResponse.redirect(new URL('/dashboard', request.url));
    applySecurityHeaders(redirect, nonce);
    return redirect;
  }

  // Pass the nonce to the app via request headers so Next can apply it to its scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  applySecurityHeaders(response, nonce);
  return response;
}

export const config = {
  matcher: [
    /**
     * Everything except Next internals, the API proxy, and files with an extension.
     * Without excluding static assets this would run on every image and font request.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};
