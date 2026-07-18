import type { Metadata } from 'next';
import Link from 'next/link';
import { ScrollText, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { adminServer, type AuditEntry } from '@/services/admin.server';

export const metadata: Metadata = {
  title: 'Audit log',
  robots: { index: false, follow: false },
};

const ACTION_LABELS: Record<string, string> = {
  'user.role_changed': 'Role changed',
  'user.status_changed': 'Status changed',
  'shelter.approved': 'Shelter approved',
  'shelter.rejected': 'Shelter rejected',
  'shelter.suspended': 'Shelter suspended',
  'pet.approved': 'Listing approved',
  'pet.rejected': 'Listing rejected',
  'pet.featured': 'Listing featured',
  'pet.unfeatured': 'Listing unfeatured',
  'pet.removed': 'Listing removed',
};

const DESTRUCTIVE = new Set([
  'user.status_changed',
  'shelter.rejected',
  'shelter.suspended',
  'pet.rejected',
  'pet.removed',
]);

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'user.role_changed', label: 'Role changes' },
  { value: 'user.status_changed', label: 'Status changes' },
  { value: 'shelter.approved', label: 'Shelter approvals' },
  { value: 'pet.approved', label: 'Listing approvals' },
];

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Renders the before → after diff without dumping raw JSON at the reader. */
function Change({ entry }: { entry: AuditEntry }) {
  const before = entry.before ?? {};
  const after = entry.after ?? {};
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));

  if (keys.length === 0) return null;

  return (
    <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {keys.map((key) => (
        <li key={key} className="text-muted-foreground">
          {key}:{' '}
          <span className="line-through">{String(before[key] ?? '—')}</span>
          {' → '}
          <span className="text-foreground font-medium">{String(after[key] ?? '—')}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; page?: string }>;
}) {
  const params = await searchParams;
  const { items, meta } = await adminServer.auditLogs({
    action: params.action,
    page: params.page ? Number(params.page) : 1,
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Audit log</h1>
        <p className="text-muted-foreground mt-1">
          {meta.total.toLocaleString()} recorded action{meta.total === 1 ? '' : 's'} · append-only,
          retained for one year
        </p>
      </div>

      <nav aria-label="Filter audit log" className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const active = (params.action ?? '') === filter.value;
          return (
            <Link
              key={filter.label}
              href={filter.value ? `/admin/audit-logs?action=${filter.value}` : '/admin/audit-logs'}
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
          icon={ScrollText}
          title="Nothing recorded yet"
          description="Every administrative action is written here automatically."
        />
      ) : (
        <ol className="flex flex-col gap-2">
          {items.map((entry) => (
            <li key={entry.id} className="bg-card rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      className={
                        DESTRUCTIVE.has(entry.action)
                          ? 'bg-destructive/10 text-destructive border-0'
                          : 'bg-success/10 text-success border-0'
                      }
                    >
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </Badge>
                    {entry.entityLabel ? (
                      <span className="truncate text-sm font-medium">{entry.entityLabel}</span>
                    ) : null}
                  </div>

                  <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
                    <ShieldCheck className="size-3" />
                    {entry.actor.name} ({entry.actor.email})
                    {entry.ip ? ` · ${entry.ip}` : ''}
                  </p>

                  <Change entry={entry} />

                  {entry.note ? (
                    <p className="bg-muted/50 mt-2 rounded-lg p-2 text-sm">{entry.note}</p>
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
          ))}
        </ol>
      )}
    </div>
  );
}
