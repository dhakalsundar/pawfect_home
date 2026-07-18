'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Monitor, Smartphone, LogOut, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { authService, type ActiveSession } from '@/services/auth.service';
import { isApiError } from '@/services/api-error';
import { describeUserAgent } from '@/lib/user-agent';

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ActiveSessions() {
  const [sessions, setSessions] = useState<ActiveSession[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSessions(await authService.sessions());
    } catch {
      setSessions([]);
    }
  }, []);

  // Initial fetch via a cancellable promise — setState lands in the async callback, not the effect
  // body, so it does not trigger a cascading synchronous render.
  useEffect(() => {
    let active = true;
    authService
      .sessions()
      .then((s) => {
        if (active) setSessions(s);
      })
      .catch(() => {
        if (active) setSessions([]);
      });
    return () => {
      active = false;
    };
  }, []);

  async function revoke(family: string) {
    setBusy(family);
    try {
      await authService.revokeSession(family);
      toast.success('Session signed out.');
      await load();
    } catch (error) {
      toast.error(isApiError(error) ? error.message : 'Could not sign out that session.');
    } finally {
      setBusy(null);
    }
  }

  async function revokeOthers() {
    setBusy('others');
    try {
      await authService.revokeOtherSessions();
      toast.success('Signed out of all other sessions.');
      await load();
    } catch (error) {
      toast.error(isApiError(error) ? error.message : 'Could not sign out other sessions.');
    } finally {
      setBusy(null);
    }
  }

  if (sessions === null) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    );
  }

  const others = sessions.filter((s) => !s.current);

  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {sessions.map((session) => {
          const { browser, os } = describeUserAgent(session.userAgent);
          const Icon = os === 'iOS' || os === 'Android' ? Smartphone : Monitor;
          return (
            <li
              key={session.id}
              className="bg-card flex items-center justify-between gap-3 rounded-xl border p-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-lg">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {browser} on {os}
                    {session.current ? (
                      <Badge className="bg-success/10 text-success border-0">This device</Badge>
                    ) : null}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {session.ip ? `${session.ip} · ` : ''}active {formatWhen(session.lastUsedAt)}
                  </p>
                </div>
              </div>

              {session.current ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => revoke(session.id)}
                  disabled={busy === session.id}
                  aria-label="Sign out this session"
                  className="text-muted-foreground hover:text-destructive shrink-0"
                >
                  {busy === session.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <X className="size-4" />
                  )}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {others.length > 0 ? (
        <Button
          type="button"
          variant="outline"
          onClick={revokeOthers}
          disabled={busy === 'others'}
          className="gap-1.5 self-start"
        >
          {busy === 'others' ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <LogOut className="size-4" />
          )}
          Sign out all other sessions
        </Button>
      ) : null}
    </div>
  );
}
