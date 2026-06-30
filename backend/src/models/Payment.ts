import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';

// See the note in User.ts — mongoose is CJS, so named ESM imports fail at runtime.
const { Schema, model, models } = mongoose;

export type PaymentStatus = 'created' | 'processing' | 'succeeded' | 'failed' | 'refunded';

/** Stripe (dormant, USD), eSewa (the NPR gateway, Batch 3), or cash on delivery (an offline pledge). */
export type PaymentProvider = 'stripe' | 'esewa' | 'cod';

export interface IPayment {
  _id: Types.ObjectId;
  provider: PaymentProvider;
  stripePaymentIntentId?: string;
  stripeSessionId?: string;
  stripeCustomerId?: string;
  stripeChargeId?: string;
  /**
   * The gateway's own reference for a settled payment — eSewa's transaction ref, or a manual
   * marker for a cash pledge. Provider-agnostic so a receipt or a reconciliation can quote one id
   * regardless of how the money arrived.
   */
  transactionId?: string;
  /** When the money was actually confirmed received (as opposed to when the row was created). */
  paidAt?: Date;
  user?: Types.ObjectId;
  /** Integer minor units (paisa). Never a float — see the note below. */
  amount: number;
  currency: string;
  status: PaymentStatus;
  purpose: 'donation' | 'adoption_fee';
  relatedId?: Types.ObjectId;
  receiptUrl?: string;
  failureReason?: string;
  /** The raw gateway response (Stripe webhook event, eSewa verification payload) — kept for audit. */
  rawEvent?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    provider: { type: String, enum: ['stripe', 'esewa', 'cod'], default: 'stripe' },
    stripePaymentIntentId: String,
    stripeSessionId: String,
    stripeCustomerId: String,
    stripeChargeId: String,
    transactionId: String,
    paidAt: Date,
    user: { type: Schema.Types.ObjectId, ref: 'User' },

    /**
     * Integer minor units (paisa) — the same shape gateways expect.
     *
     * Never a decimal: 0.1 + 0.2 !== 0.3 in binary floating point, and money that fails to add up
     * is not a rounding curiosity — it is a reconciliation bug that surfaces months later against
     * a bank statement.
     */
    amount: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Amount must be an integer number of paisa.',
      },
    },
    currency: { type: String, default: 'npr', lowercase: true },
    status: {
      type: String,
      enum: ['created', 'processing', 'succeeded', 'failed', 'refunded'],
      default: 'created',
    },
    purpose: { type: String, enum: ['donation', 'adoption_fee'], required: true },
    relatedId: Schema.Types.ObjectId,
    receiptUrl: String,
    failureReason: String,
    rawEvent: Schema.Types.Mixed,
  },
  { timestamps: true },
);

/**
 * The idempotency key for the whole webhook path.
 *
 * Stripe retries deliveries — on timeout, on a non-2xx, and sometimes simply twice — so every
 * handler must assume it will run more than once for the same event. Sparse because a payment row
 * exists from the moment Checkout is created, before any PaymentIntent id is known; without
 * `sparse` every such row would collide on null.
 */
paymentSchema.index({ stripePaymentIntentId: 1 }, { unique: true, sparse: true });
paymentSchema.index({ stripeSessionId: 1 }, { unique: true, sparse: true });
// The gateway reference is the idempotency key for eSewa the way the PaymentIntent id is for
// Stripe — unique so a replayed verification can never settle the same payment twice. Sparse
// because Stripe and cash rows carry no `transactionId` until (if ever) they settle.
paymentSchema.index({ transactionId: 1 }, { unique: true, sparse: true });
paymentSchema.index({ user: 1, createdAt: -1 });
paymentSchema.index({ status: 1 });

export const Payment =
  (models.Payment as Model<IPayment>) ?? model<IPayment>('Payment', paymentSchema);
