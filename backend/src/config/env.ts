import { config } from 'dotenv';
import { z } from 'zod';

config();

/**
 * Every environment variable the API needs, validated once at boot.
 *
 * The point of failing here rather than at first use: a missing STRIPE_SECRET_KEY should crash the
 * process on startup, not surface as a 500 the first time somebody tries to donate. Keys for
 * services we have not wired up yet are optional and guarded by the `isConfigured` flags below.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  API_PREFIX: z.string().default('/api/v1'),

  // Comma-separated list; the first entry is treated as the canonical frontend origin.
  FRONTEND_URL: z.string().default('http://localhost:3000'),

  // --- Batch 2 onwards -------------------------------------------------
  MONGODB_URI: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(32).optional(),
  JWT_REFRESH_SECRET: z.string().min(32).optional(),
  /**
   * 32-byte key (hex) for AES-256-GCM encryption of at-rest secrets (e.g. the TOTP shared secret).
   * Optional: when unset, the key is derived from JWT_ACCESS_SECRET so dev works out of the box.
   * A real deployment sets this so encryption keys rotate independently of the signing key.
   */
  ENCRYPTION_KEY: z.string().optional(),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),
  COOKIE_DOMAIN: z.string().optional(),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // --- Batch 10 / 13 / 6 -----------------------------------------------
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // --- Batch 13 eSewa (NPR gateway) ------------------------------------
  // Defaults are eSewa's PUBLIC UAT sandbox credentials, so the integration is exercisable out of
  // the box — the same reason the Stripe webhook secret ships a throwaway local value. Signature
  // verification is pure HMAC over these, so it needs no live account. Override all three with the
  // real merchant values (and ESEWA_ENV=production) to go live.
  ESEWA_PRODUCT_CODE: z.string().default('EPAYTEST'),
  ESEWA_SECRET: z.string().default('8gBm/:&EnhH.1/q'),
  ESEWA_ENV: z.enum(['test', 'production']).default('test'),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default('PawfectHome <no-reply@pawfecthome.org>'),

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),

  /**
   * Disables rate limiting for a full test run.
   *
   * The suites share the in-memory limiter budgets (10 logins per 15 min, 5 sensitive actions per
   * hour), so running all of them back to back starves the later ones and they skip rather than
   * run. Ignored in production — see the guard in middleware/rateLimit.ts.
   */
  DISABLE_RATE_LIMIT: z
    .string()
    .optional()
    .transform((value) => value === 'true'),

  /** Comma-separated IPs that are always allowed (never auto-blocked), e.g. an office/CI address. */
  IP_ALLOWLIST: z.string().optional(),
  /** Comma-separated IPs that are always denied at the edge (a static deny-list). */
  IP_BLOCKLIST: z.string().optional(),
});

/**
 * `.env.example` ships with blank placeholders (JWT_ACCESS_SECRET=), and dotenv loads those as
 * empty strings — which are *present* as far as zod is concerned, so `.optional()` would not
 * apply and `.min(32)` would fail the boot. Treat blank as unset, which is what a placeholder
 * actually means.
 */
const cleanedEnv = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== undefined && value.trim() !== ''),
);

const parsed = envSchema.safeParse(cleanedEnv);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error(`\nInvalid environment configuration:\n${details}\n`);
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isDev: raw.NODE_ENV === 'development',
  isProd: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',

  /** Allowed CORS origins, parsed from the comma-separated FRONTEND_URL. */
  allowedOrigins: raw.FRONTEND_URL.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  /** Static IP allow-list (never blocked) and deny-list (always blocked), parsed to arrays. */
  ipAllowlist: (raw.IP_ALLOWLIST ?? '')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean),
  ipBlocklist: (raw.IP_BLOCKLIST ?? '')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean),

  /**
   * Which optional integrations are actually usable. Services check these and degrade loudly
   * (a clear 503) instead of throwing an opaque SDK error.
   */
  isConfigured: {
    db: Boolean(raw.MONGODB_URI),
    auth: Boolean(raw.JWT_ACCESS_SECRET && raw.JWT_REFRESH_SECRET),
    google: Boolean(raw.GOOGLE_CLIENT_ID && raw.GOOGLE_CLIENT_SECRET),
    cloudinary: Boolean(
      raw.CLOUDINARY_CLOUD_NAME &&
        raw.CLOUDINARY_API_KEY &&
        raw.CLOUDINARY_API_SECRET,
    ),
    stripe: Boolean(raw.STRIPE_SECRET_KEY && raw.STRIPE_WEBHOOK_SECRET),
    // Always usable: a UAT sandbox default ships, so eSewa works without any extra configuration.
    esewa: Boolean(raw.ESEWA_PRODUCT_CODE && raw.ESEWA_SECRET),
    mail: Boolean(raw.SMTP_HOST && raw.SMTP_USER && raw.SMTP_PASSWORD),
  },
} as const;

export type Env = typeof env;
