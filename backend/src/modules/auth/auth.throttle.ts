import { security } from '../../config/security.js';

/**
 * In-memory per-IP failure counter that decides when a CAPTCHA is demanded. In-memory is consistent
 * with the rate limiter (see middleware/rateLimit.ts) — per-process, fine for a single instance;
 * a Redis-backed store is the horizontal-scaling upgrade, same as the limiter.
 *
 * Distinct from the account lockout, which is persistent and per-account: this gate is per-IP so it
 * also covers registration floods and attempts against addresses that do not exist.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function keyFor(ip: string | undefined): string {
  return ip ?? 'unknown';
}

function live(bucket: Bucket | undefined): Bucket | undefined {
  if (!bucket) return undefined;
  if (bucket.resetAt < Date.now()) return undefined;
  return bucket;
}

/** Records one failed/abusive auth attempt from this IP. */
export function recordAuthFailure(ip: string | undefined): void {
  const key = keyFor(ip);
  const existing = live(buckets.get(key));
  if (existing) {
    existing.count += 1;
  } else {
    buckets.set(key, { count: 1, resetAt: Date.now() + security.captcha.failureWindowMs });
  }
}

/** A clean success wipes the IP's slate, so a legitimate user is not challenged next time. */
export function clearAuthFailures(ip: string | undefined): void {
  buckets.delete(keyFor(ip));
}

/** True once the IP has crossed the failure threshold within the window. */
export function isCaptchaRequired(ip: string | undefined): boolean {
  const bucket = live(buckets.get(keyFor(ip)));
  return (bucket?.count ?? 0) >= security.captcha.requireAfterFailures;
}

/** Test-only reset so suites do not leak throttle state into one another. */
export function __resetThrottle(): void {
  buckets.clear();
}
