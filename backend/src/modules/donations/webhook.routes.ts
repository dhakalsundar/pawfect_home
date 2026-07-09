import { Router, raw } from 'express';
import type Stripe from 'stripe';
import { logger } from '../../config/logger.js';
import { constructWebhookEvent } from '../../config/stripe.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import * as donationsService from './donations.service.js';

const router = Router();

/**
 * Stripe webhooks.
 *
 * MOUNTED BEFORE `express.json()` — see app.ts. Signature verification is an HMAC over the exact
 * bytes Stripe sent, so anything that parses and re-serialises the body (key order, whitespace,
 * unicode escaping) invalidates it. `raw` keeps the Buffer intact.
 *
 * This endpoint is deliberately unauthenticated: the signature *is* the authentication. It is also
 * exempt from CSRF, which protects cookie-authenticated browser requests and has no meaning for a
 * server-to-server call carrying no cookies.
 */
router.post(
  '/stripe',
  raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    const signature = req.get('stripe-signature');

    if (!signature) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Missing stripe-signature header.' },
      });
    }

    let event: Stripe.Event;
    try {
      event = constructWebhookEvent(req.body as Buffer, signature);
    } catch (error) {
      /**
       * 400, not 500. A bad signature is a rejected request, not a server fault — and Stripe
       * retries 5xx, so reporting a forgery as 500 would invite it to be retried indefinitely.
       */
      logger.warn({ err: error }, 'Rejected a Stripe webhook with an invalid signature');
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_SIGNATURE', message: 'Signature verification failed.' },
      });
    }

    logger.info({ type: event.type, id: event.id }, 'Stripe webhook received');

    try {
      await handleEvent(event);
    } catch (error) {
      /**
       * Report the failure so Stripe retries. Every handler below is idempotent, which is what
       * makes asking for a retry safe rather than a way to double-charge someone.
       */
      logger.error({ err: error, type: event.type }, 'Stripe webhook handler failed');
      return res.status(500).json({
        success: false,
        error: { code: 'WEBHOOK_FAILED', message: 'Handler failed; please retry.' },
      });
    }

    // Acknowledge promptly. Stripe times out at 20 seconds and treats that as a failure.
    return res.json({ received: true });
  }),
);

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const details = donationsService.readCheckoutSession(session);

      if (!details.donationId) {
        logger.warn({ sessionId: session.id }, 'Checkout session carried no donationId metadata');
        return;
      }

      // `payment_status` can still be 'unpaid' for async methods; those settle on a later event.
      if (session.payment_status !== 'paid') {
        logger.info({ sessionId: session.id }, 'Checkout completed but not yet paid');
        return;
      }

      const outcome = await donationsService.fulfilDonation({
        donationId: details.donationId,
        paymentIntentId: details.paymentIntentId,
        ...(details.customerId ? { customerId: details.customerId } : {}),
        amount: details.amount,
        rawEvent: event,
      });

      logger.info({ donationId: details.donationId, outcome }, 'Donation fulfilment');
      return;
    }

    case 'payment_intent.payment_failed': {
      const intent = event.data.object;
      const donationId = intent.metadata?.donationId;
      if (donationId) {
        await donationsService.markDonationFailed(
          donationId,
          intent.last_payment_error?.message ?? 'Payment failed',
        );
      }
      return;
    }

    case 'charge.refunded': {
      const charge = event.data.object;
      const paymentIntentId =
        typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;

      if (paymentIntentId) {
        await donationsService.refundDonation(paymentIntentId, event);
      }
      return;
    }

    default:
      // Everything else is acknowledged and ignored. Returning an error for an event type we do
      // not handle would make Stripe retry it forever.
      logger.debug({ type: event.type }, 'Unhandled Stripe event type');
  }
}

export default router;
