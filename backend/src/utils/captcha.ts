import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import svgCaptcha from 'svg-captcha';
import { env } from '../config/env.js';
import { security } from '../config/security.js';

/**
 * An offline CAPTCHA. No Google/Cloudflare, so it is fully demonstrable without keys and its every
 * mechanism can be explained for the coursework.
 *
 * The design is stateless-signed + single-use:
 *  - The answer never travels to the client in readable form. The image is drawn by svg-captcha as
 *    vector <path> outlines — the characters are NOT present as text nodes, so a bot cannot regex
 *    the answer out of the SVG markup (which a naive <text>-based renderer would leak). And the
 *    token carries only an HMAC of the code, so only the server (holding the secret) can check a
 *    guess — the browser cannot solve its own challenge.
 *  - The token is `<exp>.<jti>.<sig>` where sig = HMAC(secret, code.exp.jti). Tampering with the
 *    expiry or id invalidates the signature.
 *  - jti is burned on first successful verification, so a solved token cannot be replayed.
 */

/**
 * Derived from the JWT secret when present, else a per-process random secret. A restart therefore
 * invalidates outstanding challenges, which is harmless given their 3-minute lifetime.
 */
const CAPTCHA_SECRET =
  env.JWT_ACCESS_SECRET ?? randomBytes(32).toString('hex');

/** jti values already spent, with their expiry, swept lazily so the map cannot grow unbounded. */
const consumed = new Map<string, number>();

function sweep(): void {
  const now = Date.now();
  for (const [jti, exp] of consumed) {
    if (exp < now) consumed.delete(jti);
  }
}

function sign(payload: string): string {
  return createHmac('sha256', CAPTCHA_SECRET).update(payload).digest('hex');
}

/** Case- and space-insensitive, so "ab cd" and "ABCD" match the stored "ABCD". */
function normalise(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

export interface CaptchaChallenge {
  token: string;
  /** An <img>-safe data URI. Rendered via <img>, never inlined, so its markup cannot execute. */
  image: string;
}

export function generateCaptcha(): CaptchaChallenge {
  const challenge = svgCaptcha.create({
    size: security.captcha.length,
    noise: 3,
    color: true,
    background: '#f5f3ef',
    // Drop glyphs that are ambiguous in a distorted font, so a human is not punished for it.
    ignoreChars: '0oOo1ilLI',
  });

  const code = normalise(challenge.text);
  const exp = Date.now() + security.captcha.challengeTtlMs;
  const jti = randomBytes(9).toString('base64url');
  const sig = sign(`${code}.${exp}.${jti}`);
  const token = `${exp}.${jti}.${sig}`;
  return { token, image: toDataUri(challenge.data) };
}

/**
 * Returns true only for a well-formed, unexpired, unspent token whose answer matches. Never throws
 * on malformed input — a prober feeding garbage gets a plain false, not a 500.
 */
export function verifyCaptcha(token: string | undefined, answer: string | undefined): boolean {
  if (!token || !answer) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [expRaw, jti, sig] = parts as [string, string, string];

  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;

  sweep();
  if (consumed.has(jti)) return false;

  const expected = sign(`${normalise(answer)}.${exp}.${jti}`);
  // Length guard first — timingSafeEqual throws on a length mismatch.
  if (expected.length !== sig.length) return false;
  const ok = timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  if (!ok) return false;

  // Burn it so a solved challenge cannot be resubmitted.
  consumed.set(jti, exp);
  return true;
}

/** Base64 data URI so the SVG can be dropped straight into an <img src>. */
function toDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

/**
 * Test-only: mint a valid token for a KNOWN code, so the verify path (accept / replay / expiry) can
 * be exercised without OCR-ing the rendered image. Not wired to any route, so it adds no attack
 * surface — reaching it requires importing the module server-side, which a client cannot do.
 */
export function __issueCaptchaForTest(code: string, ttlMs = security.captcha.challengeTtlMs): string {
  const normalisedCode = normalise(code);
  const exp = Date.now() + ttlMs;
  const jti = randomBytes(9).toString('base64url');
  return `${exp}.${jti}.${sign(`${normalisedCode}.${exp}.${jti}`)}`;
}
