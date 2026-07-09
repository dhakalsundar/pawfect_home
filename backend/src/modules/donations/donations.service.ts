import type Stripe from 'stripe';
import { Types, isValidObjectId } from 'mongoose';
import {
  buildCheckoutFields,
  checkEsewaStatus,
  decodeEsewaData,
  esewaConfig,
  isEsewaProduction,
  verifyEsewaSignature,
} from '../../config/esewa.js';
import { Donation, type IDonation, type DonationPaymentMethod } from '../../models/Donation.js';
import { Payment } from '../../models/Payment.js';
import { Shelter } from '../../models/Shelter.js';
import { Pet } from '../../models/Pet.js';
import { User } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';
import { buildMeta } from '../../utils/ApiResponse.js';
import { formatCurrency } from '../../utils/currency.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { getStripe } from '../../config/stripe.js';
import { createNotification } from '../notifications/notifications.service.js';

export interface DonationDTO {
  id: string;
  amount: number;
  currency: string;
  type: 'one_time' | 'monthly';
  paymentMethod: string;
  status: string;
  donorName: string;
  message?: string;
  isAnonymous: boolean;
  shelter?: { id: string; name: string; slug: string };
  pet?: { id: string; name: string; slug: string };
  receiptUrl?: string;
  createdAt: string;
}

interface Populated {
  _id: unknown;
  [key: string]: unknown;
}

/**
 * Anonymity is applied at serialisation, not storage.
 *
 * The real name stays on the row because a receipt and a refund both need it; every read path
 * that could reach another user substitutes it. Storing "Anonymous" instead would make the money
 * untraceable to its actual sender, which is the opposite of what a donation record is for.
 */
function displayName(donation: IDonation): string {
  return donation.isAnonymous ? 'Anonymous' : donation.donorSnapshot.name;
}

export function toDonationDTO(donation: IDonation, includeIdentity = false): DonationDTO {
  const shelter = donation.shelter as unknown as Populated | undefined;
  const pet = donation.pet as unknown as Populated | undefined;

  return {
    id: String(donation._id),
    amount: donation.amount,
    currency: donation.currency,
    type: donation.type,
    paymentMethod: donation.paymentMethod,
    status: donation.status,
    donorName: includeIdentity ? donation.donorSnapshot.name : displayName(donation),
    ...(donation.message ? { message: donation.message } : {}),
    isAnonymous: donation.isAnonymous,
    ...(shelter?.name
      ? { shelter: { id: String(shelter._id), name: String(shelter.name), slug: String(shelter.slug) } }
      : {}),
    ...(pet?.name
      ? { pet: { id: String(pet._id), name: String(pet.name), slug: String(pet.slug) } }
      : {}),
    ...(donation.receiptUrl ? { receiptUrl: donation.receiptUrl } : {}),
    createdAt: donation.createdAt.toISOString(),
  };
}

/**
 * The donor's real name and email for a signed-in user.
 *
 * Read from the database rather than the request: the access token carries only id, role and
 * status, and letting the client supply these would let anyone put a stranger's name on a
 * donation — and send them the receipt.
 */
export async function resolveDonorIdentity(userId?: string) {
  if (!userId) return null;
  const user = await User.findOne({ _id: userId, deletedAt: null }).select('name email').lean();
  return user ? { name: user.name, email: user.email } : null;
}

export interface CheckoutInput {
  amount: number;
  shelterId?: string;
  petId?: string;
  message?: string;
  isAnonymous: boolean;
  type: 'one_time' | 'monthly';
  paymentMethod: DonationPaymentMethod;
  donorName: string;
  donorEmail: string;
}

/**
 * What a checkout returns to the client, discriminated by how the money is being collected:
 *  - `stripe` / `esewa` → a URL (or form fields) to redirect the browser to the gateway
 *  - `cod`              → nothing to redirect to; the pledge is recorded and settled later
 */
export type StartDonationResult =
  | { paymentMethod: 'stripe'; donationId: string; url: string | null }
  | {
      paymentMethod: 'esewa';
      donationId: string;
      /** The browser POSTs `fields` to `url` (eSewa's form endpoint) to begin payment. */
      esewa: { url: string; fields: Record<string, string> };
    }
  | { paymentMethod: 'cod'; donationId: string; status: 'pending' };

/**
 * Starts a donation by whatever method the donor chose.
 *
 * The pending donation row is written **first**, before any gateway is contacted, so a donor who
 * pays is never left with a charge that has no record on our side. The worst case is a pending row
 * nobody ever settles, which is harmless and visible. The method then decides what happens next:
 * a gateway redirect (Stripe / eSewa) or an offline pledge (COD).
 */
export async function startDonation(
  input: CheckoutInput,
  userId?: string,
): Promise<StartDonationResult> {
  // Pre-flight the gateway BEFORE writing anything, so an unconfigured processor returns 503
  // without leaving an orphaned `failed` donation behind on every attempt.
  if (input.paymentMethod === 'stripe' && !getStripe()) {
    throw ApiError.serviceUnavailable(
      'Card payment is not available. Please choose eSewa or cash on delivery.',
    );
  }

  const { shelter, pet } = await resolveTargets(input.shelterId, input.petId);

  const donation = await Donation.create({
    ...(userId ? { donor: userId } : {}),
    donorSnapshot: { name: input.donorName, email: input.donorEmail },
    ...(shelter ? { shelter: shelter._id } : {}),
    ...(pet ? { pet: pet._id } : {}),
    amount: input.amount,
    type: input.type,
    paymentMethod: input.paymentMethod,
    status: 'pending',
    ...(input.message ? { message: input.message } : {}),
    isAnonymous: input.isAnonymous,
  });

  switch (input.paymentMethod) {
    case 'cod':
      return startCodDonation(donation, userId);
    case 'esewa':
      return startEsewaDonation(donation, userId);
    case 'stripe':
      return startStripeCheckout(donation, input, userId, { shelter, pet });
    default:
      throw ApiError.validation('That payment method is not available.');
  }
}

/**
 * eSewa — build the signed form the browser posts to the gateway.
 *
 * The `transaction_uuid` we generate is the correlation key: eSewa echoes it back on the redirect,
 * and it is stored as the payment's `transactionId` (a unique index), which is what makes a
 * replayed verification impossible to double-settle. Nothing is collected here; the donation stays
 * pending until `verifyEsewaPayment` confirms the redirect.
 */
async function startEsewaDonation(
  donation: IDonation & { save: () => Promise<unknown> },
  userId?: string,
): Promise<StartDonationResult> {
  // Alphanumeric + hyphen, unique, and traceable back to the donation.
  const transactionUuid = `PH-${String(donation._id)}-${Date.now().toString(36)}`;

  // eSewa signs and echoes rupees, never paisa — convert at this one boundary.
  const rupees = donation.amount / 100;
  const totalAmount = Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2);

  /**
   * NO query string on these URLs. eSewa appends its response as `?data=<base64>` to the
   * success_url; if the URL already carried `?donation=…`, the result is `…?donation=X?data=…`,
   * the browser folds it into one `donation` value, and the callback never sees `data` — a
   * completed payment then looks failed. The transaction is correlated by `transaction_uuid`
   * inside the signed data, so nothing else is needed here. Failure is a distinct path so the two
   * outcomes never depend on a query flag eSewa might drop.
   */
  const successUrl = `${clientUrl()}/payment/esewa`;
  const failureUrl = `${clientUrl()}/payment/esewa/failed`;

  const fields = buildCheckoutFields({ totalAmount, transactionUuid, successUrl, failureUrl });

  const payment = await Payment.create({
    provider: 'esewa',
    ...(userId ? { user: userId } : {}),
    transactionId: transactionUuid,
    amount: donation.amount,
    status: 'created',
    purpose: 'donation',
    relatedId: donation._id,
  });

  donation.payment = payment._id;
  await donation.save();

  return {
    paymentMethod: 'esewa',
    donationId: String(donation._id),
    esewa: { url: esewaConfig().formUrl, fields },
  };
}

/**
 * Cash on delivery — an offline pledge.
 *
 * Nothing is collected now: the donation stays `pending`, a `cod` payment row records the intent,
 * and the money is confirmed later by the receiving shelter (or an admin) via `settleCodDonation`.
 * A pending pledge never touches the public totals, so it cannot inflate anything before the cash
 * actually arrives — only `succeeded` donations count.
 */
async function startCodDonation(
  donation: IDonation & { save: () => Promise<unknown> },
  userId?: string,
): Promise<StartDonationResult> {
  const payment = await Payment.create({
    provider: 'cod',
    ...(userId ? { user: userId } : {}),
    amount: donation.amount,
    status: 'created',
    purpose: 'donation',
    relatedId: donation._id,
  });

  donation.payment = payment._id;
  await donation.save();

  return { paymentMethod: 'cod', donationId: String(donation._id), status: 'pending' };
}

async function startStripeCheckout(
  donation: IDonation & { save: () => Promise<unknown> },
  input: CheckoutInput,
  userId: string | undefined,
  targets: { shelter: { name?: unknown } | null; pet: { name?: unknown } | null },
): Promise<StartDonationResult> {
  const stripe = getStripe();
  if (!stripe) {
    // The donation row already exists as pending; mark it failed so it does not linger.
    donation.status = 'failed';
    await donation.save();
    throw ApiError.serviceUnavailable(
      'Card payment is not available. Please choose eSewa or cash on delivery.',
    );
  }

  const label = targets.pet
    ? `Donation for ${String(targets.pet.name)}`
    : targets.shelter
      ? `Donation to ${String(targets.shelter.name)}`
      : 'Donation to PawfectHome';

  try {
    const session = await stripe.checkout.sessions.create({
      mode: input.type === 'monthly' ? 'subscription' : 'payment',
      customer_email: input.donorEmail,
      line_items: [
        {
          quantity: 1,
          price_data: {
            // Stripe is USD-only here and dormant (no keys → the guard above returns 503 before
            // this runs). eSewa is the NPR gateway. Left as 'usd' so this never claims to charge
            // NPR through a processor that cannot.
            currency: 'usd',
            // Already integer minor units — handed to the processor unchanged, no arithmetic between.
            unit_amount: input.amount,
            product_data: { name: label },
            ...(input.type === 'monthly' ? { recurring: { interval: 'month' as const } } : {}),
          },
        },
      ],
      success_url: `${clientUrl()}/donate/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientUrl()}/donate?cancelled=1`,
      /**
       * The donation id travels with the session and comes back on the webhook. This is what
       * links an event to our row without trusting anything the client sends at redirect time —
       * the success page is just a redirect and can be forged or replayed.
       */
      metadata: { donationId: String(donation._id) },
    });

    await Payment.create({
      provider: 'stripe',
      stripeSessionId: session.id,
      ...(userId ? { user: userId } : {}),
      amount: input.amount,
      status: 'created',
      purpose: 'donation',
      relatedId: donation._id,
    });

    donation.payment = (await Payment.findOne({ stripeSessionId: session.id }).select('_id'))?._id;
    await donation.save();

    return { paymentMethod: 'stripe', donationId: String(donation._id), url: session.url };
  } catch (error) {
    // The session failed, so nothing can ever pay this row. Mark it rather than leaving a pending
    // donation that will sit in the totals query forever.
    donation.status = 'failed';
    await donation.save();
    logger.error({ err: error }, 'Stripe Checkout session creation failed');
    throw ApiError.serviceUnavailable('Could not start the payment. Please try again.');
  }
}

/** The primary frontend origin. FRONTEND_URL may list several for CORS; the first is canonical. */
function clientUrl(): string {
  return env.allowedOrigins[0] ?? 'http://localhost:3000';
}

async function resolveTargets(shelterId?: string, petId?: string) {
  let pet = null;
  let shelter = null;

  if (petId) {
    pet = await Pet.findOne({ _id: petId, deletedAt: null }).select('name slug shelter').lean();
    if (!pet) throw ApiError.notFound('Pet');
  }

  // A pet's shelter wins over any shelter the client named — the money must follow the pet.
  const targetShelterId = pet?.shelter ?? shelterId;

  if (targetShelterId) {
    shelter = await Shelter.findOne({ _id: targetShelterId, deletedAt: null })
      .select('name slug owner status')
      .lean();
    if (!shelter) throw ApiError.notFound('Shelter');
    if (shelter.status !== 'approved') {
      throw ApiError.validation('That shelter is not currently accepting donations.');
    }
  }

  return { shelter, pet };
}

/**
 * Applies a completed payment to its donation. **Idempotent** — safe to run repeatedly.
 *
 * Stripe retries deliveries on timeout, on any non-2xx, and occasionally just twice; a handler
 * that assumes exactly-once delivery will double-count money. Two things make this safe: the
 * unique index on `stripePaymentIntentId`, and the terminal-state guard below.
 */
export async function fulfilDonation(params: {
  donationId: string;
  paymentIntentId: string;
  chargeId?: string;
  customerId?: string;
  receiptUrl?: string;
  amount: number;
  rawEvent: unknown;
}): Promise<'applied' | 'duplicate' | 'unknown'> {
  const donation = await Donation.findById(params.donationId);
  if (!donation) {
    logger.warn({ donationId: params.donationId }, 'Webhook referenced an unknown donation');
    return 'unknown';
  }

  // Already terminal. A replay must not re-run the side effects below.
  if (donation.status === 'succeeded' || donation.status === 'refunded') {
    return 'duplicate';
  }

  /**
   * Claim the PaymentIntent id atomically.
   *
   * `upsert` against the unique index is what makes concurrent deliveries safe: if two retries
   * arrive at once, exactly one creates the row and the other updates it — neither can produce a
   * second payment for the same intent. Checking-then-writing would leave a window between them.
   */
  const payment = await Payment.findOneAndUpdate(
    { stripePaymentIntentId: params.paymentIntentId },
    {
      $set: {
        provider: 'stripe',
        stripePaymentIntentId: params.paymentIntentId,
        ...(params.chargeId ? { stripeChargeId: params.chargeId } : {}),
        ...(params.customerId ? { stripeCustomerId: params.customerId } : {}),
        ...(params.receiptUrl ? { receiptUrl: params.receiptUrl } : {}),
        amount: params.amount,
        status: 'succeeded',
        purpose: 'donation',
        relatedId: donation._id,
        ...(donation.donor ? { user: donation.donor } : {}),
        rawEvent: params.rawEvent,
      },
    },
    { upsert: true, new: true },
  );

  donation.status = 'succeeded';
  donation.payment = payment._id;
  if (params.receiptUrl) donation.receiptUrl = params.receiptUrl;
  await donation.save();

  await applyDonationCounters(donation, params.amount);
  await notifyShelterOfDonation(donation, params.amount);

  return 'applied';
}

/** Bumps the denormalised totals the dashboards read. */
async function applyDonationCounters(donation: IDonation, amount: number): Promise<void> {
  if (donation.donor) {
    await User.updateOne({ _id: donation.donor }, { $inc: { 'stats.donationsTotal': amount } });
  }
  if (donation.shelter) {
    await Shelter.updateOne({ _id: donation.shelter }, { $inc: { 'stats.donationsTotal': amount } });
  }
}

async function notifyShelterOfDonation(donation: IDonation, amount: number): Promise<void> {
  if (!donation.shelter) return;

  const shelter = await Shelter.findById(donation.shelter).select('owner name').lean();
  if (!shelter?.owner) return;

  await createNotification({
    recipient: shelter.owner,
    type: 'donation_received',
    title: `${formatCurrency(amount)} donation received`,
    body: donation.isAnonymous
      ? 'An anonymous supporter donated to your shelter.'
      : `${donation.donorSnapshot.name} donated to your shelter.`,
    link: '/shelter/donations',
    entity: { kind: 'donation', id: donation._id },
  });
}

/**
 * Settles a cash-on-delivery pledge once the shelter has the money in hand.
 *
 * Authorised to the receiving shelter's owner or an admin — a donor cannot mark their own pledge
 * paid, or the totals would be trivially inflatable. **Idempotent**: only a `pending` COD donation
 * transitions, so a double-click or a retry cannot count the money twice. It converges on the same
 * `applyDonationCounters` + `notifyShelterOfDonation` path a gateway payment uses, so a settled
 * pledge is indistinguishable downstream from a card or eSewa payment.
 */
export async function settleCodDonation(
  donationId: string,
  viewer: { id: string; role: string; shelterId?: string },
): Promise<DonationDTO> {
  if (!isValidObjectId(donationId)) throw ApiError.notFound('Donation');

  // Ownership folded into the query — an admin sees all, a shelter owner only their shelter's.
  const filter: Record<string, unknown> = { _id: donationId, paymentMethod: 'cod' };
  if (viewer.role !== 'admin') {
    if (!viewer.shelterId) throw ApiError.forbidden('Only the receiving shelter can confirm this.');
    filter.shelter = viewer.shelterId;
  }

  const donation = await Donation.findOne(filter);
  if (!donation) throw ApiError.notFound('Donation');

  // Idempotent: already settled (or refunded) → return the current state, change nothing.
  if (donation.status !== 'pending') {
    await donation.populate([
      { path: 'shelter', select: 'name slug' },
      { path: 'pet', select: 'name slug' },
    ]);
    return toDonationDTO(donation.toObject() as IDonation, true);
  }

  const now = new Date();
  donation.status = 'succeeded';
  await donation.save();

  if (donation.payment) {
    await Payment.updateOne(
      { _id: donation.payment },
      {
        $set: {
          status: 'succeeded',
          paidAt: now,
          // A human-verifiable marker rather than a gateway ref, so cash settlements are auditable.
          transactionId: `cod_${String(donation._id)}`,
        },
      },
    );
  }

  await applyDonationCounters(donation, donation.amount);
  await notifyShelterOfDonation(donation, donation.amount);

  logger.info({ donationId, settledBy: viewer.id }, 'COD donation settled');

  await donation.populate([
    { path: 'shelter', select: 'name slug' },
    { path: 'pet', select: 'name slug' },
  ]);
  return toDonationDTO(donation.toObject() as IDonation, true);
}

export type EsewaOutcome =
  | 'succeeded'
  | 'duplicate'
  | 'invalid_signature'
  | 'amount_mismatch'
  | 'not_complete'
  | 'unknown';

/** Populate + serialise a donation for the verify response. */
async function loadDonationDTO(donationId: Types.ObjectId): Promise<DonationDTO | undefined> {
  const donation = await Donation.findById(donationId)
    .populate([
      { path: 'shelter', select: 'name slug' },
      { path: 'pet', select: 'name slug' },
    ])
    .lean<IDonation>();
  return donation ? toDonationDTO(donation, true) : undefined;
}

/**
 * Verifies an eSewa redirect payload and settles the donation. **Idempotent and concurrency-safe.**
 *
 * The gate is: a valid signature (proves eSewa produced it), the paid amount matching our record
 * to the paisa, and the payload reporting COMPLETE. In production a server-to-server status check
 * is additionally required (see `checkEsewaStatus`). Settlement claims the donation with an atomic
 * pending→succeeded flip, so two concurrent redirects — or a replay — can never count the money
 * twice: only the flip's winner runs the counters.
 */
export async function verifyEsewaPayment(
  data: Record<string, string>,
): Promise<{ outcome: EsewaOutcome; donation?: DonationDTO }> {
  if (!verifyEsewaSignature(data)) return { outcome: 'invalid_signature' };

  const transactionUuid = data.transaction_uuid;
  if (!transactionUuid) return { outcome: 'invalid_signature' };

  const payment = await Payment.findOne({ transactionId: transactionUuid, provider: 'esewa' });
  if (!payment?.relatedId) return { outcome: 'unknown' };

  const donation = await Donation.findById(payment.relatedId);
  if (!donation) return { outcome: 'unknown' };

  // A replay of an already-settled payment: acknowledge, change nothing.
  if (donation.status === 'succeeded') {
    return { outcome: 'duplicate', donation: await loadDonationDTO(donation._id) };
  }
  if (donation.status !== 'pending') return { outcome: 'not_complete' };

  const failPayment = async (reason: string) => {
    await Donation.updateOne({ _id: donation._id, status: 'pending' }, { $set: { status: 'failed' } });
    await Payment.updateOne({ _id: payment._id }, { $set: { status: 'failed', failureReason: reason } });
  };

  // Amount cross-check. eSewa may format total_amount with thousands separators ("1,000.0").
  const paidPaisa = Math.round(parseFloat(String(data.total_amount).replace(/,/g, '')) * 100);
  if (!Number.isFinite(paidPaisa) || paidPaisa !== donation.amount) {
    await failPayment(`amount mismatch: paid ${data.total_amount}, expected ${donation.amount} paisa`);
    return { outcome: 'amount_mismatch' };
  }

  // The signed payload must itself report success.
  if (data.status !== 'COMPLETE') {
    await failPayment(`eSewa status ${data.status}`);
    return { outcome: 'not_complete' };
  }

  // Production hardening: confirm against eSewa's servers. A definitive non-COMPLETE rejects; an
  // unreachable check does not block a payment already proven by signature.
  if (isEsewaProduction()) {
    const confirmed = await checkEsewaStatus(transactionUuid, String(data.total_amount).replace(/,/g, ''));
    if (confirmed && confirmed.status !== 'COMPLETE') {
      await failPayment(`eSewa status API reported ${confirmed.status}`);
      return { outcome: 'not_complete' };
    }
  }

  // Atomically claim the donation. If another concurrent redirect already flipped it, we lose the
  // race and must NOT run the counters again.
  const claimed = await Donation.findOneAndUpdate(
    { _id: donation._id, status: 'pending' },
    { $set: { status: 'succeeded' } },
    { new: true },
  );
  if (!claimed) {
    return { outcome: 'duplicate', donation: await loadDonationDTO(donation._id) };
  }

  await Payment.updateOne(
    { _id: payment._id },
    {
      $set: {
        status: 'succeeded',
        paidAt: new Date(),
        // eSewa's own reference for the settled payment, for receipts and reconciliation.
        ...(data.transaction_code ? { transactionId: transactionUuid } : {}),
        rawEvent: data,
      },
    },
  );

  await applyDonationCounters(claimed, claimed.amount);
  await notifyShelterOfDonation(claimed, claimed.amount);

  logger.info(
    { donationId: String(claimed._id), transactionUuid, ref: data.transaction_code },
    'eSewa donation settled',
  );

  return { outcome: 'succeeded', donation: await loadDonationDTO(claimed._id) };
}

/** Decodes eSewa's base64 `data` param and verifies it. A garbage blob is an invalid signature. */
export async function verifyEsewaCallback(
  base64Data: string,
): Promise<{ outcome: EsewaOutcome; donation?: DonationDTO }> {
  let data: Record<string, string>;
  try {
    data = decodeEsewaData(base64Data);
  } catch {
    return { outcome: 'invalid_signature' };
  }
  return verifyEsewaPayment(data);
}

export async function markDonationFailed(donationId: string, reason?: string): Promise<void> {
  const donation = await Donation.findById(donationId);
  // A donation that already succeeded must not be walked back by a late failure event.
  if (!donation || donation.status !== 'pending') return;

  donation.status = 'failed';
  await donation.save();

  if (donation.payment) {
    await Payment.updateOne(
      { _id: donation.payment },
      { $set: { status: 'failed', ...(reason ? { failureReason: reason } : {}) } },
    );
  }
}

/** Reverses a refunded donation, including the counters it previously incremented. */
export async function refundDonation(paymentIntentId: string, rawEvent: unknown): Promise<boolean> {
  const payment = await Payment.findOne({ stripePaymentIntentId: paymentIntentId });
  if (!payment || payment.status === 'refunded') return false;

  payment.status = 'refunded';
  payment.rawEvent = rawEvent;
  await payment.save();

  const donation = await Donation.findById(payment.relatedId);
  if (!donation || donation.status === 'refunded') return false;

  donation.status = 'refunded';
  await donation.save();

  // Mirror of applyDonationCounters — a refunded donation must not keep inflating the totals.
  if (donation.donor) {
    await User.updateOne({ _id: donation.donor }, { $inc: { 'stats.donationsTotal': -donation.amount } });
  }
  if (donation.shelter) {
    await Shelter.updateOne(
      { _id: donation.shelter },
      { $inc: { 'stats.donationsTotal': -donation.amount } },
    );
  }

  return true;
}

export interface ListDonationsQuery {
  page: number;
  limit: number;
  status?: string;
}

/**
 * Scoped listing. The scope is a query condition, never a post-filter.
 *
 * - admin sees everything
 * - a shelter owner sees donations to their shelter, plus their own
 * - everyone else sees only their own
 */
export async function listDonations(
  query: ListDonationsQuery,
  viewer: { id: string; role: string; shelterId?: string },
) {
  const filter: Record<string, unknown> = {};

  if (viewer.role === 'admin') {
    // No scope condition.
  } else if (viewer.role === 'shelter' && viewer.shelterId) {
    filter.$or = [{ shelter: viewer.shelterId }, { donor: viewer.id }];
  } else {
    filter.donor = viewer.id;
  }

  if (query.status) filter.status = query.status;

  const skip = (query.page - 1) * query.limit;

  const [donations, total] = await Promise.all([
    Donation.find(filter)
      // `_id` last so pagination stays stable where createdAt ties — see buildSort in pets.service.
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(query.limit)
      .populate([
        { path: 'shelter', select: 'name slug' },
        { path: 'pet', select: 'name slug' },
      ])
      .lean<IDonation[]>(),
    Donation.countDocuments(filter),
  ]);

  return {
    // The viewer is entitled to the real name on their own rows and, as a recipient or admin, on
    // rows addressed to them — anonymity hides a donor from the public, not from their receipt.
    items: donations.map((donation) => toDonationDTO(donation, true)),
    meta: buildMeta(total, query.page, query.limit),
  };
}

/** A single donation, readable only by its donor, the receiving shelter's owner, or an admin. */
export async function getDonation(
  donationId: string,
  viewer: { id: string; role: string; shelterId?: string },
) {
  const filter: Record<string, unknown> = { _id: donationId };

  if (viewer.role !== 'admin') {
    const conditions: Record<string, unknown>[] = [{ donor: viewer.id }];
    if (viewer.role === 'shelter' && viewer.shelterId) {
      conditions.push({ shelter: viewer.shelterId });
    }
    filter.$or = conditions;
  }

  const donation = await Donation.findOne(filter)
    .populate([
      { path: 'shelter', select: 'name slug' },
      { path: 'pet', select: 'name slug' },
    ])
    .lean<IDonation>();

  if (!donation) throw ApiError.notFound('Donation');
  return toDonationDTO(donation, true);
}

/**
 * Public totals for the donation banner and the donor wall.
 *
 * Only `succeeded` rows count. Including pending ones would let anyone inflate the public total
 * by opening Checkout sessions they never pay.
 */
export async function getDonationStats(shelterId?: string) {
  const match: Record<string, unknown> = { status: 'succeeded' };

  /**
   * Cast explicitly — `aggregate()` does NOT apply schema casting the way `find()` does, so a
   * string id silently matches nothing and the shelter's total comes back as zero rather than
   * erroring. `find({shelter: shelterId})` below works without this, which is exactly what makes
   * the omission easy to miss.
   */
  if (shelterId) {
    if (!isValidObjectId(shelterId)) throw ApiError.notFound('Shelter');
    match.shelter = new Types.ObjectId(shelterId);
  }

  const [totals] = await Donation.aggregate<{ total: number; count: number; donors: string[] }>([
    { $match: match },
    {
      $group: {
        _id: null,
        total: { $sum: '$amount' },
        count: { $sum: 1 },
        donors: { $addToSet: '$donorSnapshot.email' },
      },
    },
  ]);

  const recent = await Donation.find(match)
    .sort({ createdAt: -1, _id: -1 })
    .limit(12)
    .populate([{ path: 'shelter', select: 'name slug' }])
    .lean<IDonation[]>();

  return {
    total: totals?.total ?? 0,
    count: totals?.count ?? 0,
    donorCount: totals?.donors.length ?? 0,
    // Public surface: identity is masked here, and the raw name never leaves the server.
    recent: recent.map((donation) => toDonationDTO(donation, false)),
  };
}

/** Extracts the fields we care about from a Checkout Session, whatever else the payload carries. */
export function readCheckoutSession(session: Stripe.Checkout.Session) {
  const paymentIntent = session.payment_intent;

  return {
    donationId: session.metadata?.donationId,
    paymentIntentId:
      typeof paymentIntent === 'string' ? paymentIntent : (paymentIntent?.id ?? session.id),
    customerId: typeof session.customer === 'string' ? session.customer : undefined,
    amount: session.amount_total ?? 0,
  };
}

export type DonationId = Types.ObjectId;
