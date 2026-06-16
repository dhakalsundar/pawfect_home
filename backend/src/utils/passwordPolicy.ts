import { createHash } from 'node:crypto';
import { security } from '../config/security.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * Password-quality checks that go beyond length/complexity: a common-password blocklist and an
 * online breach check. Both catch passwords that *satisfy* the character rules yet are trivially
 * guessable (`Password1`) or already circulating in credential dumps.
 */

/**
 * A compact blocklist of the passwords that dominate every breach corpus, plus app-specific terms.
 * Not exhaustive by design — the HIBP check below covers the long tail; this gives an instant,
 * offline "no" for the worst offenders (and works when HIBP is unreachable).
 */
const COMMON_PASSWORDS = new Set(
  [
    'password',
    'password1',
    'password123',
    'passw0rd',
    '12345678',
    '123456789',
    '1234567890',
    'qwerty123',
    'qwertyuiop',
    'letmein1',
    'welcome1',
    'welcome123',
    'admin123',
    'iloveyou1',
    'monkey123',
    'abc12345',
    'football1',
    'baseball1',
    'sunshine1',
    'princess1',
    'dragon123',
    'master123',
    'trustno1',
    'changeme1',
    'pawfecthome',
    'pawfecthome1',
    'adoptme123',
  ].map((p) => p.toLowerCase()),
);

/** True for a password on the blocklist (case-insensitive). */
export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.toLowerCase());
}

/**
 * Checks a password against Have I Been Pwned's Pwned Passwords range API using k-anonymity: only
 * the first 5 characters of the SHA-1 hash ever leave this server, and the full password never
 * does. Returns true if the password appears in a known breach.
 *
 * Fails OPEN — a network error, timeout, or disabled config yields `false` (not breached), so an
 * offline environment (or the CI box) never blocks a signup on an unreachable third party. The
 * blocklist above is the offline safety net for the obvious cases.
 */
export async function isPasswordBreached(password: string): Promise<boolean> {
  if (!security.password.checkBreaches) return false;
  // Skip the network check on automated runs so suites stay deterministic and offline-safe. The
  // real deployment and the security demo (flag off) run it for real. Never skipped in production.
  if (env.isTest || (env.DISABLE_RATE_LIMIT && !env.isProd)) return false;

  const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return false;

    const body = await res.text();
    // Each line is `SUFFIX:COUNT`. A count of 0 is padding — treat only >0 as a real hit.
    for (const line of body.split('\n')) {
      const [candidate, countRaw] = line.trim().split(':');
      if (candidate === suffix) return Number(countRaw) > 0;
    }
    return false;
  } catch (error) {
    logger.warn({ err: error }, 'HIBP breach check unavailable — skipping (fail-open)');
    return false;
  }
}
