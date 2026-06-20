import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';

// See the note in User.ts — mongoose is CJS, so named ESM imports fail at runtime.
const { Schema, model, models } = mongoose;

export interface IFavorite {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  pet: Types.ObjectId;
  createdAt: Date;
}

/**
 * Its own collection rather than an array on the user document.
 *
 * An array would hit the 16 MB document ceiling eventually, cannot be paginated without loading
 * the whole thing, and makes "how many people saved this pet" an expensive scan. A join collection
 * indexes cleanly in both directions.
 */
const favoriteSchema = new Schema<IFavorite>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    pet: { type: Schema.Types.ObjectId, ref: 'Pet', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

/** Makes favouriting idempotent at the database level — a double-click cannot create two rows. */
favoriteSchema.index({ user: 1, pet: 1 }, { unique: true });
favoriteSchema.index({ user: 1, createdAt: -1 });
favoriteSchema.index({ pet: 1 });

export const Favorite =
  (models.Favorite as Model<IFavorite>) ?? model<IFavorite>('Favorite', favoriteSchema);
