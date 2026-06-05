import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';

// See the note in User.ts — mongoose is CJS, so named ESM imports fail at runtime.
const { Schema, model, models } = mongoose;

export interface IRefreshToken {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  /** SHA-256 of the token. A database leak must not hand out usable sessions. */
  tokenHash: string;
  /** Shared by every token descended from one login, so theft can revoke the whole chain. */
  family: string;
  /** Set when this token is rotated. A second use of a rotated token means it was stolen. */
  rotatedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
  userAgent?: string;
  ip?: string;
  createdAt: Date;
  updatedAt: Date;
}

const refreshTokenSchema = new Schema<IRefreshToken>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true },
    rotatedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
    userAgent: String,
    ip: String,
  },
  { timestamps: true },
);

// Mongo removes expired documents automatically, so the collection cannot grow without bound.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken =
  (models.RefreshToken as Model<IRefreshToken>) ??
  model<IRefreshToken>('RefreshToken', refreshTokenSchema);
