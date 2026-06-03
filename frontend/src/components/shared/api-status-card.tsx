import { CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { serverHttpSafe } from '@/services/server-http';
import type { HealthReport } from '@/types/api';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card shadow-soft mx-auto max-w-2xl rounded-2xl border p-6">
      <div className="mb-4 flex items-center gap-2.5">
        <ShieldCheck className="text-primary-strong size-5" />
        <h2 className="text-lg font-semibold">API connection</h2>
      </div>
      {children}
    </div>
  );
}

/** Matches the loaded card's shape so the swap-in causes no layout shift. */
export function ApiStatusCardSkeleton() {
  return (
    <Shell>
      <Skeleton className="mb-5 h-10 w-full rounded-lg" />
      <div className="grid gap-2 sm:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-9 rounded-lg" />
        ))}
      </div>
    </Shell>
  );
}

/**
 * Async Server Component isolated behind its own <Suspense> in the page.
 *
 * Keeping the await here rather than in the page body matters: an awaiting page component defers
 * its whole segment, so one status widget would hold back the hero and categories. Scoped this way,
 * the static content paints immediately and only this card streams in.
 */
export async function ApiStatusCard() {
  // serverHttpSafe, not serverHttp: if the API is down this card should say so, not throw the
  // entire route into error.tsx.
  const health = await serverHttpSafe<HealthReport>('/health', {
    withAuth: false,
    next: { revalidate: 10 },
  });

  if (!health) {
    return (
      <Shell>
        <p className="text-muted-foreground text-sm">
          Could not reach the API. Start it with{' '}
          <code className="bg-muted rounded px-1.5 py-0.5 text-xs">npm run dev</code> in{' '}
          <code className="bg-muted rounded px-1.5 py-0.5 text-xs">backend/</code>.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-muted-foreground mb-5 text-sm">
        Server Component fetched{' '}
        <code className="bg-muted rounded px-1.5 py-0.5 text-xs">/api/v1/health</code> from the
        Express backend — environment{' '}
        <span className="text-foreground font-medium">{health.environment}</span>, up for{' '}
        <span className="text-foreground font-medium">{health.uptimeSeconds}s</span>.
      </p>

      <ul className="grid gap-2 sm:grid-cols-2">
        {Object.entries(health.services).map(([name, state]) => {
          const ready = state === 'configured';
          return (
            <li
              key={name}
              className="bg-muted/50 flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
            >
              {ready ? (
                <CheckCircle2 className="text-success size-4 shrink-0" />
              ) : (
                <XCircle className="text-muted-foreground size-4 shrink-0" />
              )}
              <span className="capitalize">{name}</span>
              <span className="text-muted-foreground ml-auto text-xs">
                {ready ? 'configured' : 'pending'}
              </span>
            </li>
          );
        })}
      </ul>
    </Shell>
  );
}
