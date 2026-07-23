import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';

// See the note in User.ts — mongoose is CJS, so named ESM imports fail at runtime.
const { Schema, model, models } = mongoose;

export type NotificationType =
  | 'application_submitted'
  | 'application_status_changed'
  | 'new_message'
  | 'pet_approved'
  | 'pet_rejected'
  | 'shelter_approved'
  | 'shelter_rejected'
  | 'new_review'
  | 'donation_received'
  | 'pet_adopted'
  | 'system';

export interface INotification {
  _id: Types.ObjectId;
  recipient: Types.ObjectId;
  actor?: Types.ObjectId;
  type: NotificationType;
  title: string;
  body?: string;
  /** In-app deep link, e.g. /dashboard/applications/123. */
  link?: string;
  entity?: { kind: string; id: Types.ObjectId };
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User' },
    type: { type: String, required: true },
    title: { type: String, required: true, maxlength: 140 },
    body: { type: String, maxlength: 300 },
    link: String,
    entity: {
      kind: String,
      id: Schema.Types.ObjectId,
    },
    isRead: { type: Boolean, default: false },
    readAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

/**
 * Serves both the unread badge and the dropdown from one index — the badge counts on
 * `{recipient, isRead}` and the list sorts on `createdAt` within the same prefix.
 */
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

/**
 * Read notifications expire after 90 days. Unread ones are kept indefinitely: something the user
 * has never seen should not silently vanish, however old it is.
 */
notificationSchema.index(
  { readAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60, partialFilterExpression: { isRead: true } },
);

export const Notification =
  (models.Notification as Model<INotification>) ??
  model<INotification>('Notification', notificationSchema);
