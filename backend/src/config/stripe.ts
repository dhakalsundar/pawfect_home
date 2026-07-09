import Stripe from 'stripe';
import { env } from './env.js';
import { logger } from './logger.js';

let client: Stripe | null = null;

/**
 * The Stripe client, or null when no key is configured.
 *
 * Returning null rather than throwing at import time keeps the whole API bootable without payment
 * credentials — the same treatment Google OAuth and SMTP get. Callers that genuinely need Stripe
 * turn this into a 503; callers that only verify webhook signatures do not need it at all.
 */
export function getStripe(): Stripe | null {
  if (!env.STRIPE_SECRET_KEY) return null;

  client ??= new Stripe(env.STRIPE_SECRET_KEY, {
    // Pinned deliberately. Stripe rolls the API forward and an unpinned integration can change
    // response shapes under you on their schedule rather than yours.
    apiVersion: '2026-06-24.dahlia',
    typescript: true,
    // Stripe's client retries idempotently on network failure; two is enough to ride out a blip
    // without turning a real outage into a long hang.
    maxNetworkRetries: 2,
    timeout: 10_000,
  });

  return client;
}

export function isStripeConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

/**
 * Verifies a webhook signature and returns the parsed event.
 *
 * Deliberately independent of `getStripe()`: signature verification is pure HMAC over the raw
 * body and needs only the webhook secret, so this keeps working in environments that have no API
 * key at all. That is also what makes the webhook path testable without a Stripe account.
 *
 * Throws on any failure — an unverifiable event is not "probably fine", it is an untrusted POST
 * to an endpoint that moves money.
 */
export function constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured.');
  }

  // Static method — no API key involved.
  return Stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
}

export function warnIfUnconfigured(): void {
  if (!isStripeConfigured()) {
    logger.warn('STRIPE_SECRET_KEY not set — donation checkout will return 503.');
  }
}
