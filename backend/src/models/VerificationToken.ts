import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';

// See the note in User.ts — mongoose is CJS, so named ESM imports fail at runtime.
const { Schema, model, models } = mongoose;

export type VerificationTokenType =
  | 'email_verify'
  | 'password_reset'
  | 'two_factor'
  | 'magic_link';

export interface IVerificationToken {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  /** SHA-256 of the token that was emailed. The raw value exists only in the user's inbox. */
  tokenHash: string;
  type: VerificationTokenType;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

/**
 * One collection for both email verification and password reset — the shape and lifecycle are
 * identical and a `type` discriminator is cheaper than two near-duplicate models.
 * (docs/02-DATABASE-SCHEMA.md lists these as `passwordresettokens`; unified here.)
 */
const verificationTokenSchema = new Schema<IVerificationToken>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    type: {
      type: String,
      enum: ['email_verify', 'password_reset', 'two_factor', 'magic_link'],
      required: true,
    },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

verificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
verificationTokenSchema.index({ user: 1, type: 1 });

export const VerificationToken =
  (models.VerificationToken as Model<IVerificationToken>) ??
  model<IVerificationToken>('VerificationToken', verificationTokenSchema);
