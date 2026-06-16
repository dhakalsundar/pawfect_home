/**
 * Central knobs for the brute-force defences, so the thresholds live in one auditable place rather
 * than scattered as magic numbers through the auth service. Referenced by the account-lockout logic
 * (User model + auth.service) and the CAPTCHA gate (auth.throttle).
 */
export const security = {
  /** Per-account lockout — persistent, survives a restart because it lives on the user document. */
  lockout: {
    /** Consecutive failed logins before the account is locked. */
    maxFailedAttempts: 10,
    /** How long the lock holds. A correct password during the lock is still refused. */
    lockDurationMs: 15 * 60 * 1000,
  },

  /** Password policy knobs beyond the length/complexity the zod schema already enforces. */
  password: {
    /** How many previous password hashes to remember, to block reuse. */
    historySize: 5,
    /** Check candidates against the Have I Been Pwned breach corpus (k-anonymity; degrades offline). */
    checkBreaches: true,
    /**
     * Days after which a password is considered expired. 0 disables expiry — NIST SP 800-63B
     * advises AGAINST forced periodic rotation, so the mechanism exists (and is demonstrable) but
     * ships off. Set > 0 to enable a soft "please update your password" prompt.
     */
    maxAgeDays: 0,
  },

  /**
   * Application-layer intrusion detection. When one IP trips this many *critical* controls
   * (injection/XSS/CSRF blocked, device mismatch, token reuse, lockouts) inside the window, it is
   * auto-added to an in-memory block-list for the block duration — a lightweight IDS/IP-blocking
   * layer on top of the per-account and per-IP throttles.
   */
  intrusion: {
    autoBlockThreshold: 8,
    windowMs: 10 * 60 * 1000,
    blockDurationMs: 60 * 60 * 1000,
  },

  /** CAPTCHA gate — per-IP, in-memory (like the rate limiter), defeats scripted credential stuffing. */
  captcha: {
    /** Failed auth attempts from one IP before a challenge is demanded on the next attempt. */
    requireAfterFailures: 3,
    /** How long a failure is remembered when deciding whether a challenge is due. */
    failureWindowMs: 15 * 60 * 1000,
    /** How long an issued challenge stays solvable. Short, so a scraped token expires quickly. */
    challengeTtlMs: 3 * 60 * 1000,
    /** Number of characters in the challenge. */
    length: 5,
  },
} as const;
