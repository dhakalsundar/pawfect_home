import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';

// See the note in User.ts — mongoose is CJS, so named ESM imports fail at runtime.
const { Schema, model, models } = mongoose;

export type AuditAction =
  | 'user.role_changed'
  | 'user.status_changed'
  | 'shelter.approved'
  | 'shelter.rejected'
  | 'shelter.suspended'
  | 'pet.approved'
  | 'pet.rejected'
  | 'pet.featured'
  | 'pet.unfeatured'
  | 'pet.removed';

export interface IAuditLog {
  _id: Types.ObjectId;
  actor: Types.ObjectId;
  /** Frozen at write time — the actor may later be renamed, or their account closed. */
  actorSnapshot: { name: string; email: string };
  action: AuditAction;
  entityKind: 'user' | 'shelter' | 'pet' | 'review' | 'report';
  entityId: Types.ObjectId;
  entityLabel?: string;
  before?: unknown;
  after?: unknown;
  note?: string;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actorSnapshot: {
      name: { type: String, required: true },
      email: { type: String, required: true },
    },
    action: { type: String, required: true, index: true },
    entityKind: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true, index: true },
    entityLabel: String,
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    note: { type: String, maxlength: 1000 },
    ip: String,
    userAgent: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ createdAt: -1 });
// One year of retention, then Mongo removes entries automatically.
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

/**
 * Deliberately append-only: no update or delete path is exposed anywhere in the app, and admins
 * cannot clear their own trail. An audit log an administrator can edit is not an audit log.
 */
export const AuditLog =
  (models.AuditLog as Model<IAuditLog>) ?? model<IAuditLog>('AuditLog', auditLogSchema);
