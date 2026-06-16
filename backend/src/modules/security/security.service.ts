import type { Request } from 'express';
import {
  SecurityLog,
  defaultSeverity,
  type SecurityEvent,
  type SecuritySeverity,
} from '../../models/SecurityLog.js';
import { buildMeta } from '../../utils/ApiResponse.js';
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';
import { security } from '../../config/security.js';
import { emitToAdmins } from '../../sockets/index.js';

export interface SecurityEventInput {
  event: SecurityEvent;
  /** Overrides the per-event default from the model. */
  severity?: SecuritySeverity;
  userId?: string;
  emailAttempted?: string;
  ip?: string;
  userAgent?: string;
  method?: string;
  path?: string;
  details?: unknown;
}

/**
 * Pulls request-scoped context (ip, agent, method, path, actor) off an Express request, so callers
 * in middleware and controllers do not repeat it. The originalUrl — not url — so the mounted API
 * prefix is preserved for the reader.
 */
export function securityContext(req: Request): Pick<
  SecurityEventInput,
  'ip' | 'userAgent' | 'method' | 'path' | 'userId'
> {
  return {
    ip: req.ip,
    userAgent: req.get('user-agent'),
    method: req.method,
    path: req.originalUrl?.split('?')[0],
    userId: req.user?.id,
  };
}

/**
 * The single writer for the security log. Never throws — a control that successfully blocked an
 * attack must not then 500 because logging hiccuped — but a logging failure is loud in the server
 * log so it cannot pass unnoticed. Fire-and-forget friendly: callers may omit `await` on hot paths.
 */
export async function recordSecurityEvent(input: SecurityEventInput): Promise<void> {
  const severity = input.severity ?? defaultSeverity(input.event);
  try {
    const doc = await SecurityLog.create({
      event: input.event,
      severity,
      user: input.userId,
      emailAttempted: input.emailAttempted,
      ip: input.ip,
      userAgent: input.userAgent,
      method: input.method,
      path: input.path,
      details: input.details,
    });

    // Live feed → every connected admin. Never blocks or throws the caller.
    emitToAdmins('security:event', {
      id: String(doc._id),
      event: doc.event,
      severity: doc.severity,
      emailAttempted: doc.emailAttempted,
      ip: doc.ip,
      method: doc.method,
      path: doc.path,
      details: doc.details,
      createdAt: doc.createdAt.toISOString(),
    });
    maybeAlert(severity);
    // Feed the intrusion-detection counter (auto-IP-blocking). Not for the IP_BLOCKED event itself
    // (would recurse), and suspended for automated runs so a test IP is never auto-blocked.
    if (severity === 'critical' && input.event !== 'IP_BLOCKED' && !intrusionFrictionOff) {
      reportCriticalFromIp(input.ip);
    }
  } catch (error) {
    logger.error({ err: error, event: input.event }, 'Failed to write security log entry');
  }
}

// --- Application-layer intrusion detection (auto IP-blocking) -----------------

/** Same guard as the rest of the brute-force friction — off for automated runs, never in prod. */
const intrusionFrictionOff = env.isTest || (env.DISABLE_RATE_LIMIT && !env.isProd);

/** IPs auto-blocked because they tripped too many critical controls: ip → block-expiry (ms). */
const autoBlocked = new Map<string, number>();
/** Rolling critical-event count per IP within the detection window. */
const criticalByIp = new Map<string, { count: number; resetAt: number }>();

function isAllowlisted(ip: string | undefined): boolean {
  return Boolean(ip) && env.ipAllowlist.includes(ip as string);
}

/** True if the IP is on the static deny-list or currently auto-blocked (allow-list always wins). */
export function isIpBlocked(ip: string | undefined): boolean {
  if (!ip || isAllowlisted(ip)) return false;
  if (env.ipBlocklist.includes(ip)) return true;
  const expiry = autoBlocked.get(ip);
  if (expiry && expiry > Date.now()) return true;
  if (expiry) autoBlocked.delete(ip);
  return false;
}

/** Records a critical event from an IP and auto-blocks it once it crosses the threshold. */
function reportCriticalFromIp(ip: string | undefined): void {
  if (!ip || isAllowlisted(ip) || autoBlocked.has(ip)) return;
  const now = Date.now();
  const rec = criticalByIp.get(ip);
  if (!rec || rec.resetAt < now) {
    criticalByIp.set(ip, { count: 1, resetAt: now + security.intrusion.windowMs });
    return;
  }
  rec.count += 1;
  if (rec.count >= security.intrusion.autoBlockThreshold) {
    const until = now + security.intrusion.blockDurationMs;
    autoBlocked.set(ip, until);
    void recordSecurityEvent({
      event: 'IP_BLOCKED',
      ip,
      details: { reason: 'auto', criticalEvents: rec.count, until: new Date(until).toISOString() },
    });
  }
}

/** Test-only reset so suites do not leak block state into one another. */
export function __resetIntrusionState(): void {
  autoBlocked.clear();
  criticalByIp.clear();
}

/**
 * Rolling-window anomaly alert: when critical events cluster (a lockout wave, an injection/XSS
 * probe, distributed reuse), fire one `security:alert` to admins and then cool down, so a burst
 * surfaces as a single notification rather than a stream of them.
 */
const ALERT_WINDOW_MS = 5 * 60 * 1000;
const ALERT_THRESHOLD = 5;
const ALERT_COOLDOWN_MS = 5 * 60 * 1000;
const alertState = { windowStart: 0, count: 0, lastAlert: 0 };

function maybeAlert(severity: SecuritySeverity): void {
  if (severity !== 'critical') return;
  const now = Date.now();
  if (now - alertState.windowStart > ALERT_WINDOW_MS) {
    alertState.windowStart = now;
    alertState.count = 0;
  }
  alertState.count += 1;

  if (alertState.count >= ALERT_THRESHOLD && now - alertState.lastAlert > ALERT_COOLDOWN_MS) {
    alertState.lastAlert = now;
    emitToAdmins('security:alert', {
      message: `${alertState.count} critical security events in the last few minutes — review the security log.`,
      count: alertState.count,
      at: new Date(now).toISOString(),
    });
  }
}

/** Convenience: record straight from a request, merging its context with the given fields. */
export function recordSecurityEventFromRequest(
  req: Request,
  input: Omit<SecurityEventInput, 'ip' | 'userAgent' | 'method' | 'path'> &
    Partial<Pick<SecurityEventInput, 'ip' | 'userAgent' | 'method' | 'path'>>,
): Promise<void> {
  return recordSecurityEvent({ ...securityContext(req), ...input });
}

// --- Admin read side ---------------------------------------------------------

export async function listSecurityLogs(query: {
  event?: string;
  severity?: SecuritySeverity;
  page: number;
  limit: number;
}) {
  const filter: Record<string, unknown> = {};
  if (query.event) filter.event = query.event;
  if (query.severity) filter.severity = query.severity;

  const skip = (query.page - 1) * query.limit;

  const [logs, total] = await Promise.all([
    SecurityLog.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(query.limit)
      .populate('user', 'name email')
      .lean(),
    SecurityLog.countDocuments(filter),
  ]);

  return {
    items: logs.map((log) => {
      const actor = log.user as unknown as { name?: string; email?: string } | undefined;
      return {
        id: String(log._id),
        event: log.event,
        severity: log.severity,
        actor: actor?.email ? { name: actor.name ?? 'Unknown', email: actor.email } : undefined,
        emailAttempted: log.emailAttempted,
        ip: log.ip,
        userAgent: log.userAgent,
        method: log.method,
        path: log.path,
        // Attacker-controlled in some cases — the admin page renders it as text, never HTML.
        details: log.details,
        createdAt: log.createdAt.toISOString(),
      };
    }),
    meta: buildMeta(total, query.page, query.limit),
  };
}

/**
 * Counts per event and per severity over a recent window, for the dashboard tiles. The window
 * keeps the summary about "what is happening now" rather than a year of accumulated noise.
 */
export async function getSecuritySummary(windowHours = 24) {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  const [byEvent, bySeverity, total] = await Promise.all([
    SecurityLog.aggregate<{ _id: string; count: number }>([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$event', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    SecurityLog.aggregate<{ _id: SecuritySeverity; count: number }>([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$severity', count: { $sum: 1 } } },
    ]),
    SecurityLog.countDocuments({ createdAt: { $gte: since } }),
  ]);

  const severity = Object.fromEntries(bySeverity.map((row) => [row._id, row.count])) as Record<
    SecuritySeverity,
    number
  >;

  return {
    windowHours,
    total,
    critical: severity.critical ?? 0,
    warning: severity.warning ?? 0,
    info: severity.info ?? 0,
    byEvent: byEvent.map((row) => ({ event: row._id, count: row.count })),
  };
}
