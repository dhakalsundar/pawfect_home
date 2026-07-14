import { randomBytes } from 'node:crypto';
import { NewsletterSubscriber } from '../../models/NewsletterSubscriber.js';
import { ApiError } from '../../utils/ApiError.js';
import { sendMail } from '../../config/mailer.js';
import { env } from '../../config/env.js';

const frontend = env.allowedOrigins[0] ?? 'http://localhost:3000';

/**
 * Idempotent by design.
 *
 * Re-subscribing an existing address returns the same success response rather than a duplicate
 * error — the visitor's intent is "keep me on the list", and telling them their address is
 * already registered leaks who is subscribed to anyone who cares to probe.
 */
export async function subscribe(email: string, source: string): Promise<void> {
  const existing = await NewsletterSubscriber.findOne({ email });

  if (existing) {
    // Someone re-subscribing after opting out should come back on the list.
    if (existing.unsubscribedAt) {
      existing.unsubscribedAt = null;
      existing.confirmedAt = null;
      existing.unsubscribeToken = randomBytes(24).toString('hex');
      await existing.save();
      await sendConfirmation(email, existing.unsubscribeToken);
    }
    return;
  }

  const unsubscribeToken = randomBytes(24).toString('hex');
  await NewsletterSubscriber.create({ email, source, unsubscribeToken });
  await sendConfirmation(email, unsubscribeToken);
}

function sendConfirmation(email: string, token: string) {
  const url = `${frontend}/newsletter/confirm?token=${token}`;
  return sendMail({
    to: email,
    subject: 'Confirm your PawfectHome newsletter subscription',
    html: `<p>Thanks for subscribing to PawfectHome.</p>
           <p>Confirm your subscription: <a href="${url}">${url}</a></p>
           <p>If you didn't sign up, ignore this email — nothing further will be sent.</p>`,
    text: `Thanks for subscribing to PawfectHome.\n\nConfirm: ${url}\n\nIf you didn't sign up, ignore this email.`,
  });
}

export async function confirm(token: string): Promise<void> {
  const subscriber = await NewsletterSubscriber.findOne({ unsubscribeToken: token });
  if (!subscriber) throw ApiError.validation('This confirmation link is invalid or has expired.');

  if (!subscriber.confirmedAt) {
    subscriber.confirmedAt = new Date();
    await subscriber.save();
  }
}

export async function unsubscribe(token: string): Promise<void> {
  const subscriber = await NewsletterSubscriber.findOne({ unsubscribeToken: token });
  if (!subscriber) throw ApiError.validation('This unsubscribe link is invalid.');

  subscriber.unsubscribedAt = new Date();
  await subscriber.save();
}
