import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';

// See the note in User.ts — mongoose is CJS, so named ESM imports fail at runtime.
const { Schema, model, models } = mongoose;

export interface INewsletterSubscriber {
  _id: Types.ObjectId;
  email: string;
  confirmedAt: Date | null;
  unsubscribeToken: string;
  /** Where the signup came from, so we can tell which surfaces actually convert. */
  source: string;
  unsubscribedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const newsletterSubscriberSchema = new Schema<INewsletterSubscriber>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    confirmedAt: { type: Date, default: null },
    unsubscribeToken: { type: String, required: true, index: true },
    source: { type: String, default: 'homepage' },
    unsubscribedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const NewsletterSubscriber =
  (models.NewsletterSubscriber as Model<INewsletterSubscriber>) ??
  model<INewsletterSubscriber>('NewsletterSubscriber', newsletterSubscriberSchema);
