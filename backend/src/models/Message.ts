import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';

// See the note in User.ts — mongoose is CJS, so named ESM imports fail at runtime.
const { Schema, model, models } = mongoose;

export interface IMessage {
  _id: Types.ObjectId;
  conversation: Types.ObjectId;
  sender: Types.ObjectId;
  body: string;
  attachments: { url: string; publicId?: string; name?: string }[];
  readBy: { user: Types.ObjectId; at: Date }[];
  deletedAt: Date | null;
  createdAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    attachments: [
      {
        _id: false,
        url: { type: String, required: true },
        publicId: String,
        name: String,
      },
    ],
    readBy: [
      {
        _id: false,
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        at: { type: Date, default: Date.now },
      },
    ],
    deletedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

/**
 * Serves cursor pagination directly: newest first within a conversation, with `_id` breaking ties.
 *
 * `_id` matters more than usual here. ObjectIds embed a second-resolution timestamp plus a counter,
 * so under rapid sends several messages share a `createdAt` millisecond — sorting on it alone
 * would return them in an arbitrary order and the conversation would read out of sequence.
 */
messageSchema.index({ conversation: 1, createdAt: -1, _id: -1 });

export const Message =
  (models.Message as Model<IMessage>) ?? model<IMessage>('Message', messageSchema);
