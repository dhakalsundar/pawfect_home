import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';

// See the note in User.ts — mongoose is CJS, so named ESM imports fail at runtime.
const { Schema, model, models } = mongoose;

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface IReview {
  _id: Types.ObjectId;
  author: Types.ObjectId;
  targetType: 'shelter' | 'pet';
  shelter?: Types.ObjectId;
  pet?: Types.ObjectId;
  rating: number;
  title?: string;
  comment: string;
  images: { url: string; publicId?: string }[];
  /** Present when the author actually adopted from this shelter — drives the verified badge. */
  adoptionApplication?: Types.ObjectId;
  status: ReviewStatus;
  moderatedBy?: Types.ObjectId;
  moderationNote?: string;
  helpfulCount: number;
  /** Who marked it helpful, so the vote is idempotent rather than a counter anyone can spin. */
  helpfulBy: Types.ObjectId[];
  shelterReply?: { body: string; at: Date; by: Types.ObjectId };
  /**
   * Mirrors `deletedAt === null`.
   *
   * Exists purely so the unique index below can be partial: a partialFilterExpression cannot
   * express "deletedAt is null" (null equality is not an allowed operator there), so the condition
   * is mirrored into a boolean the index *can* filter on. Same workaround as the pets `isActive`
   * flag in Batch 4.
   */
  isActive: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new Schema<IReview>(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: ['shelter', 'pet'], required: true },
    shelter: { type: Schema.Types.ObjectId, ref: 'Shelter' },
    pet: { type: Schema.Types.ObjectId, ref: 'Pet' },

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      // Half-stars would break the distribution bars, which bucket by whole rating.
      validate: { validator: Number.isInteger, message: 'Rating must be a whole number of stars.' },
    },
    title: { type: String, trim: true, maxlength: 100 },
    comment: { type: String, required: true, trim: true, minlength: 10, maxlength: 1000 },
    images: [{ _id: false, url: { type: String, required: true }, publicId: String }],

    adoptionApplication: { type: Schema.Types.ObjectId, ref: 'AdoptionApplication' },

    /**
     * Moderated before publication. A review is a permanent public statement about someone's
     * business, so it is `pending` until a human approves it — the opposite default would let a
     * defamatory post sit live until somebody noticed.
     */
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    moderatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    moderationNote: { type: String, maxlength: 500 },

    helpfulCount: { type: Number, default: 0, min: 0 },
    helpfulBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],

    shelterReply: {
      body: { type: String, trim: true, maxlength: 1000 },
      at: Date,
      by: { type: Schema.Types.ObjectId, ref: 'User' },
    },

    isActive: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

/** Keeps `isActive` in step with `deletedAt` however the row was written. */
reviewSchema.pre('validate', function syncIsActive() {
  this.isActive = this.deletedAt === null || this.deletedAt === undefined;
});

/**
 * One review per user per shelter, enforced by the DATABASE, not by a check-then-insert.
 *
 * A service-level "have you already reviewed this?" lookup has a window between the read and the
 * write: two concurrent submissions both see nothing and both insert. Only a unique index closes
 * it. Partial so that rejected/deleted reviews free the slot, and so pet reviews (which have no
 * `shelter`) are not all collapsed into one row per author.
 */
reviewSchema.index(
  { author: 1, shelter: 1 },
  {
    unique: true,
    partialFilterExpression: { targetType: 'shelter', isActive: true },
  },
);

// Drives the public list: a shelter's approved reviews, newest first.
reviewSchema.index({ shelter: 1, status: 1, createdAt: -1, _id: -1 });
// The moderation queue.
reviewSchema.index({ status: 1, createdAt: -1, _id: -1 });

export const Review = (models.Review as Model<IReview>) ?? model<IReview>('Review', reviewSchema);
