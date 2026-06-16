import type { NextFunction, Request, Response } from 'express';
import sanitizeHtml from 'sanitize-html';
import { recordSecurityEvent, securityContext } from '../modules/security/security.service.js';

/**
 * Two request-hardening passes, mounted before every API route.
 *
 *  1. NoSQL-operator stripping — Mongo queries are objects, so an attacker smuggles an operator
 *     object where a string is expected (`{"email":{"$gt":""}}` matches the first user). We remove
 *     any key beginning with `$` or containing `.` from the body, query and params. Values are left
 *     untouched, so a genuine "Roses $5.99" is unaffected. This pairs with the zod type-assertions
 *     the validators already do: stripping alone leaves `email` as `{}`, and the schema then rejects
 *     a non-string with a clean 400 rather than a silent match.
 *
 *  2. HTML stripping — every user string field has all markup removed (the policy is that no field
 *     may contain HTML at all, which sidesteps the "safe subset" parsing games most filters lose).
 *     Combined with React's escape-on-render and the CSP nonce, that is three independent layers.
 *
 * Blocked payloads are recorded as INJECTION_ATTEMPT_BLOCKED / XSS_ATTEMPT_BLOCKED so a probe is
 * visible on the admin security page.
 */

/**
 * Fields never HTML-stripped, for two different reasons:
 *
 *  - Credentials/tokens: stripping would silently corrupt the secret.
 *  - Conversational free-text (chat body, review comment): this app defends those by escaping on
 *    render (React, no dangerouslySetInnerHTML) under a strict CSP — the correct layer for content
 *    that legitimately contains `<`, `>`, code or maths. Stripping them would mangle honest messages
 *    (and change the documented "stored verbatim, escaped on render" behaviour that guards chat).
 *
 * Every other string field (name, bio, title, address, description, …) — where markup is never
 * meaningful — IS stripped, which is where an <img onerror=…> payload gets neutralised at input.
 */
const SKIP_FIELDS = new Set([
  // Credentials / tokens
  'password',
  'currentPassword',
  'newPassword',
  'confirmPassword',
  'token',
  'captchaToken',
  'captchaAnswer',
  'code',
  'csrfToken',
  // Escape-on-render free text
  'body',
  'message',
  'comment',
  'content',
]);

function isOperatorKey(key: string): boolean {
  return key.startsWith('$') || key.includes('.');
}

/** Recursively deletes operator keys in place. Returns the keys it removed. */
function stripOperators(value: unknown, removed: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) stripOperators(item, removed);
    return;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (isOperatorKey(key)) {
        removed.push(key);
        delete (value as Record<string, unknown>)[key];
        continue;
      }
      stripOperators((value as Record<string, unknown>)[key], removed);
    }
  }
}

/**
 * sanitize-html strips tags but also HTML-entity-encodes the remaining text (`Tom & Jerry` becomes
 * `Tom &amp; Jerry`, `5 < 10` becomes `5 &lt; 10`). Left encoded, React would then render the raw
 * `&amp;`. So we decode those entities back — legitimate `&`, `<`, `>` in a name survive untouched,
 * while any actual tag has already been removed.
 */
function decodeEntities(input: string): string {
  return input
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#96;/g, '`')
    .replace(/&amp;/g, '&'); // last, so the others aren't re-created
}

function cleanText(value: string): string {
  return decodeEntities(sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }));
}

/** Recursively strips HTML from string values in place. Returns true if anything was changed. */
function stripHtml(value: unknown, changed: { any: boolean }, keyName?: string): unknown {
  if (typeof value === 'string') {
    if (keyName && SKIP_FIELDS.has(keyName)) return value;
    const cleaned = cleanText(value);
    // Only a genuine tag removal counts as an attempt — an untouched "Tom & Jerry" round-trips to
    // itself and is neither changed nor flagged.
    if (cleaned !== value && /<[a-z!/]/i.test(value)) changed.any = true;
    return cleaned === value ? value : cleaned;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripHtml(item, changed, keyName));
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) obj[key] = stripHtml(obj[key], changed, key);
    return obj;
  }
  return value;
}

/**
 * Express 5 makes `req.query` a lazy getter that cannot be reassigned, so a cleaned query is put
 * back with defineProperty; `req.body` and `req.params` are ordinary mutable objects.
 */
function replaceQuery(req: Request, cleaned: unknown): void {
  Object.defineProperty(req, 'query', { value: cleaned, writable: true, configurable: true });
}

export function mongoSanitize(req: Request, _res: Response, next: NextFunction): void {
  const removed: string[] = [];
  if (req.body) stripOperators(req.body, removed);
  if (req.params) stripOperators(req.params, removed);
  if (req.query && typeof req.query === 'object') {
    // Clone so we mutate a copy, then swap it in (the live getter object may be recreated per read).
    const cleaned = structuredClone(req.query);
    stripOperators(cleaned, removed);
    if (removed.length > 0) replaceQuery(req, cleaned);
  }

  if (removed.length > 0) {
    void recordSecurityEvent({
      event: 'INJECTION_ATTEMPT_BLOCKED',
      ...securityContext(req),
      details: { strippedKeys: [...new Set(removed)] },
    });
  }
  next();
}

/**
 * HTTP Parameter Pollution guard. Express turns a repeated query key (`?role=user&role=admin`) into
 * an array, which lets an attacker smuggle a second value past a check that only inspected the
 * first. We collapse every array-valued query parameter to its LAST value — the app's zod query
 * schemas all expect scalars, so a single safe value is exactly what the validators want. Blocked
 * duplicates are recorded so a probing attempt is visible.
 */
export function hppGuard(req: Request, _res: Response, next: NextFunction): void {
  if (req.query && typeof req.query === 'object') {
    const cleaned = structuredClone(req.query) as Record<string, unknown>;
    const collapsed: string[] = [];
    for (const key of Object.keys(cleaned)) {
      const value = cleaned[key];
      if (Array.isArray(value) && value.length > 1) {
        collapsed.push(key);
        cleaned[key] = value[value.length - 1];
      }
    }
    if (collapsed.length > 0) {
      Object.defineProperty(req, 'query', { value: cleaned, writable: true, configurable: true });
      void recordSecurityEvent({
        event: 'PARAM_POLLUTION_BLOCKED',
        ...securityContext(req),
        details: { params: [...new Set(collapsed)] },
      });
    }
  }
  next();
}

export function xssSanitize(req: Request, _res: Response, next: NextFunction): void {
  const changed = { any: false };
  if (req.body && typeof req.body === 'object') {
    req.body = stripHtml(req.body, changed);
  }

  if (changed.any) {
    void recordSecurityEvent({
      event: 'XSS_ATTEMPT_BLOCKED',
      ...securityContext(req),
    });
  }
  next();
}
