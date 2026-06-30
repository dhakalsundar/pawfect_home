import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';

// See the note in User.ts — mongoose is CJS, so named ESM imports fail at runtime.
const { Schema, model, models } = mongoose;

export type DonationStatus = 'pending' | 'succeeded' | 'failed' | 'refunded';

export type DonationPaymentMethod = 'stripe' | 'esewa' | 'cod';

export interface IDonation {
  _id: Types.ObjectId;
  donor?: Types.ObjectId;
  /** Captured at donation time so a receipt stays accurate if the user later renames or leaves. */
  donorSnapshot: { name: string; email: string };
  shelter?: Types.ObjectId;
  pet?: Types.ObjectId;
  /** Integer minor units (paisa). */
  amount: number;
  currency: string;
  type: 'one_time' | 'monthly';
  /** How the donor chose to pay. `status` tracks whether that payment has settled. */
  paymentMethod: DonationPaymentMethod;
  status: DonationStatus;
  payment?: Types.ObjectId;
  message?: string;
  isAnonymous: boolean;
  receiptUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const donationSchema = new Schema<IDonation>(
  {
    // Null for a guest donation. The snapshot carries the receipt details either way.
    donor: { type: Schema.Types.ObjectId, ref: 'User' },
    donorSnapshot: {
      name: { type: String, required: true, trim: true, maxlength: 120 },
      email: { type: String, required: true, trim: true, lowercase: true },
    },
    shelter: { type: Schema.Types.ObjectId, ref: 'Shelter' },
    pet: { type: Schema.Types.ObjectId, ref: 'Pet' },

    amount: {
      type: Number,
      required: true,
      // Rs. 1 floor (100 paisa) — a nominal minimum so a gateway fee never exceeds the gift.
      min: 100,
      max: 100_000_00,
      validate: {
        validator: Number.isInteger,
        message: 'Amount must be an integer number of paisa.',
      },
    },
    currency: { type: String, default: 'npr', lowercase: true },
    type: { type: String, enum: ['one_time', 'monthly'], default: 'one_time' },
    paymentMethod: { type: String, enum: ['stripe', 'esewa', 'cod'], default: 'stripe' },
    status: {
      type: String,
      enum: ['pending', 'succeeded', 'failed', 'refunded'],
      default: 'pending',
    },
    payment: { type: Schema.Types.ObjectId, ref: 'Payment' },
    message: { type: String, trim: true, maxlength: 300 },
    isAnonymous: { type: Boolean, default: false },
    receiptUrl: String,
  },
  { timestamps: true },
);

donationSchema.index({ donor: 1, createdAt: -1, _id: -1 });
donationSchema.index({ shelter: 1, status: 1 });
// Drives both the public totals and the donor wall, which only ever reads succeeded rows.
donationSchema.index({ status: 1, createdAt: -1, _id: -1 });

export const Donation =
  (models.Donation as Model<IDonation>) ?? model<IDonation>('Donation', donationSchema);
