import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldAlert, ShieldCheck, Activity, Globe } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { adminServer, type SecurityEntry, type SecuritySeverity } from '@/services/admin.server';
import { SecurityMonitor } from '@/features/admin/components/security-monitor';
import { eventLabel, SEVERITY_STYLES, formatWhen } from '@/features/admin/lib/security-labels';

export const metadata: Metadata = {
  title: 'Security log',
  robots: { index: false, follow: false },
};

const SEVERITY_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'critical', label: 'Critical' },
  { value: 'warning', label: 'Warning' },
  { value: 'info', label: 'Info' },
];

/** Attacker-controlled in the injection/XSS cases — rendered as plain text, never as HTML. */
function formatDetails(details: unknown): string | null {
  if (details == null) return null;
  if (typeof details === 'string') return details;
  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}

function SummaryTile({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Activity;
  tone: string;
}) {
  return (
    <div className="bg-card rounded-2xl border p-4">
      <div className="flex items-center gap-2">
        <span className={`grid size-8 place-items-center rounded-lg ${tone}`}>
          <Icon className="size-4" />
        </span>
        <span className="text-muted-foreground text-xs font-medium">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}

export default async function SecurityLogPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; severity?: SecuritySeverity; page?: string }>;
}) {
  const params = await searchParams;
  const [{ items, meta }, summary] = await Promise.all([
    adminServer.securityLogs({
      event: params.event,
      severity: params.severity,
      page: params.page ? Number(params.page) : 1,
    }),
    adminServer.securitySummary(),
  ]);

  const activeSeverity = params.severity ?? '';

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Security log</h1>
        <p className="text-muted-foreground mt-1">
          {meta.total.toLocaleString()} recorded event{meta.total === 1 ? '' : 's'} · append-only,
          retained for one year
        </p>
      </div>

      {/* Real-time feed over the admin socket room */}
      <SecurityMonitor />

      {/* Last-24h summary tiles */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile
          label={`Events (${summary.windowHours}h)`}
          value={summary.total}
          icon={Activity}
          tone="bg-muted text-foreground"
        />
        <SummaryTile
          label="Critical"
          value={summary.critical}
          icon={ShieldAlert}
          tone="bg-destructive/10 text-destructive"
        />
        <SummaryTile
          label="Warning"
          value={summary.warning}
          icon={ShieldAlert}
          tone="bg-amber-500/10 text-amber-600 dark:text-amber-400"
        />
        <SummaryTile
          label="Info"
          value={summary.info}
          icon={ShieldCheck}
          tone="bg-success/10 text-success"
        />
      </div>

      <nav aria-label="Filter by severity" className="mb-6 flex flex-wrap gap-2">
        {SEVERITY_FILTERS.map((filter) => {
          const active = activeSeverity === filter.value;
          const href = filter.value
            ? `/admin/security-logs?severity=${filter.value}`
            : '/admin/security-logs';
          return (
            <Link
              key={filter.label}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'bg-brand-50 text-primary-strong rounded-lg px-3 py-1.5 text-sm font-medium'
                  : 'text-muted-foreground hover:bg-muted rounded-lg px-3 py-1.5 text-sm transition-colors'
              }
            >
              {filter.label}
            </Link>
          );
        })}
      </nav>

      {items.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Nothing recorded yet"
          description="Authentication events, blocked attacks and privileged actions appear here automatically."
        />
      ) : (
        <ol className="flex flex-col gap-2">
          {items.map((entry: SecurityEntry) => {
            const details = formatDetails(entry.details);
            const who = entry.actor?.email ?? entry.emailAttempted;
            return (
              <li key={entry.id} className="bg-card rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={SEVERITY_STYLES[entry.severity]}>
                        {eventLabel(entry.event)}
                      </Badge>
                      {who ? <span className="truncate text-sm font-medium">{who}</span> : null}
                    </div>

                    <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      {entry.ip ? (
                        <span className="flex items-center gap-1">
                          <Globe className="size-3" />
                          {entry.ip}
                        </span>
                      ) : null}
                      {entry.method && entry.path ? (
                        <span className="font-mono">
                          {entry.method} {entry.path}
                        </span>
                      ) : null}
                    </p>

                    {details ? (
                      <p className="bg-muted/50 text-muted-foreground mt-2 rounded-lg p-2 font-mono text-xs break-all">
                        {details}
                      </p>
                    ) : null}
                  </div>

                  <time
                    dateTime={entry.createdAt}
                    className="text-muted-foreground shrink-0 text-xs whitespace-nowrap"
                  >
                    {formatWhen(entry.createdAt)}
                  </time>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
