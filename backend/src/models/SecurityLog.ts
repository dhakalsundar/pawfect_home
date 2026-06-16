import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';

// See the note in User.ts — mongoose is CJS, so named ESM imports fail at runtime.
const { Schema, model, models } = mongoose;

/**
 * Every security-relevant event the platform can observe. Kept as a TS union (not a schema-level
 * enum) exactly like AuditLog.action: later phases add new events without a migration, and an
 * unknown value can never make the recorder throw mid-request.
 *
 * The naming is outcome-explicit — *_BLOCKED means a control stopped an attack, *_FAILED means a
 * legitimate-looking attempt did not succeed, *_SUCCESS is a completed sensitive action.
 */
export type SecurityEvent =
  // Authentication
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'ACCOUNT_LOCKED'
  | 'LOCKED_LOGIN_BLOCKED'
  | 'CAPTCHA_REQUIRED'
  | 'CAPTCHA_FAILED'
  // Multi-factor
  | 'TWO_FACTOR_CHALLENGED'
  | 'TWO_FACTOR_SUCCESS'
  | 'TWO_FACTOR_FAILED'
  | 'TWO_FACTOR_ENABLED'
  | 'TWO_FACTOR_DISABLED'
  | 'BACKUP_CODE_USED'
  // Passwordless
  | 'MAGIC_LINK_REQUESTED'
  | 'MAGIC_LINK_CONSUMED'
  // Credentials & sessions
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET'
  | 'PASSWORD_REUSE_BLOCKED'
  | 'SESSION_REVOKED'
  | 'SESSIONS_REVOKED_ALL'
  | 'DEVICE_MISMATCH_BLOCKED'
  | 'REFRESH_REUSE_DETECTED'
  // Injection / client-side defences
  | 'CSRF_BLOCKED'
  | 'XSS_ATTEMPT_BLOCKED'
  | 'INJECTION_ATTEMPT_BLOCKED'
  | 'PARAM_POLLUTION_BLOCKED'
  | 'IP_BLOCKED'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED_ACCESS'
  // Privacy
  | 'DATA_EXPORTED'
  | 'DATA_IMPORTED';

export type SecuritySeverity = 'info' | 'warning' | 'critical';

export interface ISecurityLog {
  _id: Types.ObjectId;
  event: SecurityEvent;
  severity: SecuritySeverity;
  /** Present when the actor was authenticated. Absent for anonymous attackers. */
  user?: Types.ObjectId;
  /**
   * The address a failed/blocked auth attempt targeted, even when no such account exists — this is
   * how an enumeration or credential-stuffing run becomes visible. Stored lowercased.
   */
  emailAttempted?: string;
  ip?: string;
  userAgent?: string;
  method?: string;
  path?: string;
  /**
   * Free-form context. Attacker-controlled in the injection/XSS cases, so it is rendered as text
   * and never as HTML on the admin page — the same rule the audit log follows.
   */
  details?: unknown;
  createdAt: Date;
}

/** Default severity per event, so callers do not have to remember it. Overridable per call. */
const SEVERITY_BY_EVENT: Partial<Record<SecurityEvent, SecuritySeverity>> = {
  ACCOUNT_LOCKED: 'critical',
  LOCKED_LOGIN_BLOCKED: 'warning',
  CSRF_BLOCKED: 'critical',
  XSS_ATTEMPT_BLOCKED: 'critical',
  INJECTION_ATTEMPT_BLOCKED: 'critical',
  PARAM_POLLUTION_BLOCKED: 'warning',
  IP_BLOCKED: 'critical',
  DEVICE_MISMATCH_BLOCKED: 'critical',
  REFRESH_REUSE_DETECTED: 'critical',
  UNAUTHORIZED_ACCESS: 'critical',
  PASSWORD_REUSE_BLOCKED: 'warning',
  TWO_FACTOR_FAILED: 'warning',
  CAPTCHA_FAILED: 'warning',
  LOGIN_FAILED: 'warning',
  RATE_LIMITED: 'warning',
};

export function defaultSeverity(event: SecurityEvent): SecuritySeverity {
  return SEVERITY_BY_EVENT[event] ?? 'info';
}

const securityLogSchema = new Schema<ISecurityLog>(
  {
    event: { type: String, required: true, index: true },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info', index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    emailAttempted: { type: String, lowercase: true, trim: true },
    ip: String,
    userAgent: String,
    method: String,
    path: String,
    details: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

securityLogSchema.index({ createdAt: -1 });
securityLogSchema.index({ event: 1, createdAt: -1 });
// One year of retention, then Mongo removes entries automatically — same policy as the audit log.
securityLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

/**
 * Append-only by design: no update or delete route is exposed anywhere. The security log is the
 * evidence trail for every control in the app, so an attacker (or an admin) must not be able to
 * erase their own footprints.
 */
export const SecurityLog =
  (models.SecurityLog as Model<ISecurityLog>) ??
  model<ISecurityLog>('SecurityLog', securityLogSchema);
