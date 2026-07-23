'use client';

import { useEffect, useState } from 'react';
import { Activity, ShieldAlert, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useSocket } from '@/providers/socket-provider';
import { eventLabel, SEVERITY_STYLES } from '@/features/admin/lib/security-labels';
import type { SecuritySeverity } from '@/services/admin.server';

interface LiveEvent {
  id: string;
  event: string;
  severity: SecuritySeverity;
  emailAttempted?: string;
  ip?: string;
  method?: string;
  path?: string;
  createdAt: string;
}

interface AlertPayload {
  message: string;
  count: number;
  at: string;
}

const MAX_LIVE = 20;

function timeOnly(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour12: false });
}

/**
 * The real-time half of the security page. Admin sockets join the server-side `admins` room and
 * receive every event as it is recorded, plus a throttled `security:alert` when critical events
 * cluster. Purely additive — the page's server-rendered history stays below.
 */
export function SecurityMonitor() {
  const { socket, connected } = useSocket();
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [alert, setAlert] = useState<AlertPayload | null>(null);

  useEffect(() => {
    if (!socket) return;

    const onEvent = (e: LiveEvent) => {
      setEvents((prev) => [e, ...prev].slice(0, MAX_LIVE));
    };
    const onAlert = (a: AlertPayload) => {
      setAlert(a);
      toast.error(a.message, { duration: 8000 });
    };

    socket.on('security:event', onEvent);
    socket.on('security:alert', onAlert);
    // Remove only our own listeners — the socket is shared across features.
    return () => {
      socket.off('security:event', onEvent);
      socket.off('security:alert', onAlert);
    };
  }, [socket]);

  return (
    <div className="bg-card mb-6 rounded-2xl border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="size-4" />
          Live monitor
        </h2>
        <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <span
            className={`inline-block size-2 rounded-full ${
              connected ? 'animate-pulse bg-green-500' : 'bg-muted-foreground/40'
            }`}
            aria-hidden="true"
          />
          {connected ? 'Live' : 'Connecting…'}
        </span>
      </div>

      {alert ? (
        <Alert variant="destructive" className="mb-3">
          <ShieldAlert className="size-4" />
          <AlertDescription>{alert.message}</AlertDescription>
        </Alert>
      ) : null}

      {events.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center text-xs">
          Watching for activity — new events appear here the moment they happen.
        </p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {events.map((e) => (
            <li key={e.id} className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground shrink-0 font-mono tabular-nums">
                {timeOnly(e.createdAt)}
              </span>
              <Badge className={SEVERITY_STYLES[e.severity]}>{eventLabel(e.event)}</Badge>
              <span className="text-muted-foreground flex min-w-0 items-center gap-1 truncate">
                {e.emailAttempted ? <span className="truncate">{e.emailAttempted}</span> : null}
                {e.ip ? (
                  <span className="flex items-center gap-0.5">
                    <Globe className="size-3" />
                    {e.ip}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
