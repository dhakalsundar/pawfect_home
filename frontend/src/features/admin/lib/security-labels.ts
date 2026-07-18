import type { SecuritySeverity } from '@/services/admin.server';

/** Human labels for the machine event names. Unknown events fall back to the raw name. */
export const EVENT_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: 'Login',
  LOGIN_FAILED: 'Failed login',
  LOGOUT: 'Logout',
  ACCOUNT_LOCKED: 'Account locked',
  LOCKED_LOGIN_BLOCKED: 'Login blocked (locked)',
  CAPTCHA_REQUIRED: 'CAPTCHA required',
  CAPTCHA_FAILED: 'CAPTCHA failed',
  TWO_FACTOR_CHALLENGED: '2FA challenged',
  TWO_FACTOR_SUCCESS: '2FA passed',
  TWO_FACTOR_FAILED: '2FA failed',
  TWO_FACTOR_ENABLED: '2FA enabled',
  TWO_FACTOR_DISABLED: '2FA disabled',
  BACKUP_CODE_USED: 'Backup code used',
  MAGIC_LINK_REQUESTED: 'Magic link requested',
  MAGIC_LINK_CONSUMED: 'Magic link used',
  PASSWORD_CHANGED: 'Password changed',
  PASSWORD_RESET: 'Password reset',
  PASSWORD_REUSE_BLOCKED: 'Password reuse blocked',
  SESSION_REVOKED: 'Session revoked',
  SESSIONS_REVOKED_ALL: 'All sessions revoked',
  DEVICE_MISMATCH_BLOCKED: 'Device mismatch blocked',
  REFRESH_REUSE_DETECTED: 'Token reuse detected',
  CSRF_BLOCKED: 'CSRF blocked',
  XSS_ATTEMPT_BLOCKED: 'XSS blocked',
  INJECTION_ATTEMPT_BLOCKED: 'Injection blocked',
  PARAM_POLLUTION_BLOCKED: 'Param pollution blocked',
  IP_BLOCKED: 'IP blocked',
  RATE_LIMITED: 'Rate limited',
  UNAUTHORIZED_ACCESS: 'Unauthorized access',
  DATA_EXPORTED: 'Data exported',
  DATA_IMPORTED: 'Data imported',
};

export function eventLabel(event: string): string {
  return EVENT_LABELS[event] ?? event;
}

export const SEVERITY_STYLES: Record<SecuritySeverity, string> = {
  critical: 'bg-destructive/10 text-destructive border-0',
  warning: 'bg-amber-500/10 text-amber-600 border-0 dark:text-amber-400',
  info: 'bg-success/10 text-success border-0',
};

export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}
