import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';

// See the note in User.ts — mongoose is CJS, so named ESM imports fail at runtime.
const { Schema, model, models } = mongoose;

export interface IConversation {
  _id: Types.ObjectId;
  participants: Types.ObjectId[];
  /** Both participant ids sorted and joined — see the index note below. */
  pairKey: string;
  shelter?: Types.ObjectId;
  pet?: Types.ObjectId;
  /** Denormalised so the inbox renders from one query instead of N. */
  lastMessage?: { body: string; sender: Types.ObjectId; at: Date };
  /** Per-participant unread counters, keyed by user id. */
  unread: Map<string, number>;
  archivedBy: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<IConversation>(
  {
    participants: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      required: true,
      validate: {
        validator: (participants: Types.ObjectId[]) => participants.length === 2,
        message: 'A conversation has exactly two participants.',
      },
    },
    pairKey: { type: String, required: true },
    shelter: { type: Schema.Types.ObjectId, ref: 'Shelter' },
    pet: { type: Schema.Types.ObjectId, ref: 'Pet' },

    lastMessage: {
      body: String,
      sender: { type: Schema.Types.ObjectId, ref: 'User' },
      at: Date,
    },

    /**
     * A Map rather than two named fields: the pair is symmetric, and keying by user id means the
     * same code path works regardless of who is reading.
     */
    unread: { type: Map, of: Number, default: () => new Map<string, number>() },

    archivedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true },
);

/** Keeps `pairKey` in step with `participants` no matter which code path wrote them. */
conversationSchema.pre('validate', function derivePairKey() {
  if (this.isModified('participants')) {
    this.pairKey = this.participants.map(String).sort().join(':');
  }
});

// Drives the inbox: "my conversations, most recently active first".
conversationSchema.index({ participants: 1, updatedAt: -1, _id: -1 });

/**
 * One thread per participant pair per pet.
 *
 * Keyed on `pairKey` rather than on `participants` directly, because a unique index over an array
 * is MULTIKEY: it indexes each element separately, so `[A,B]+pet` and `[C,B]+pet` would collide on
 * the shared `B` — a shelter owner could hold only one conversation per pet, and the second
 * adopter to write in would hit a duplicate-key error. A scalar key indexes the pair as a unit.
 *
 * Not partial: documents with no `pet` index as null, so a pair also gets exactly one general
 * thread — which is the behaviour we want, and which `$exists: false` cannot express in a
 * partialFilterExpression anyway.
 */
conversationSchema.index({ pairKey: 1, pet: 1 }, { unique: true });

export const Conversation =
  (models.Conversation as Model<IConversation>) ??
  model<IConversation>('Conversation', conversationSchema);
