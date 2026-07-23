'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, Trash2, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { useNotifications } from '@/providers/notification-provider';
import { timeAgo } from '@/types/notification';
import { cn } from '@/lib/utils';

export function NotificationList() {
  const { notifications, unreadCount, connected, markRead, markAllRead, remove } = useNotifications();
  const router = useRouter();

  async function open(id: string, link?: string) {
    await markRead(id);
    if (link) router.push(link);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {unreadCount > 0 ? (
            <Badge className="bg-primary border-0 text-white">{unreadCount} unread</Badge>
          ) : (
            <span className="text-muted-foreground text-sm">All caught up</span>
          )}
          <span
            className={cn(
              'flex items-center gap-1 text-xs',
              connected ? 'text-success' : 'text-muted-foreground',
            )}
          >
            {connected ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
            {connected ? 'Live' : 'Reconnecting…'}
          </span>
        </div>

        {unreadCount > 0 ? (
          <Button variant="outline" size="sm" onClick={() => void markAllRead()} className="gap-1.5">
            <CheckCheck className="size-4" />
            Mark all read
          </Button>
        ) : null}
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications yet"
          description="When a shelter responds to an application, you'll hear about it here."
          action={
            <Button asChild className="bg-brand-gradient border-0 text-white">
              <Link href="/pets">Browse pets</Link>
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {notifications.map((notification) => (
            <li
              key={notification.id}
              className={cn(
                'bg-card flex items-start gap-3 rounded-2xl border p-4 transition-colors',
                !notification.isRead && 'border-primary/30 bg-brand-50/40',
              )}
            >
              <span
                className={cn(
                  'mt-1.5 size-2 shrink-0 rounded-full',
                  notification.isRead ? 'bg-muted-foreground/30' : 'bg-primary',
                )}
                aria-hidden="true"
              />

              <button
                type="button"
                onClick={() => void open(notification.id, notification.link)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block font-medium">{notification.title}</span>
                {notification.body ? (
                  <span className="text-muted-foreground mt-0.5 block text-sm leading-relaxed">
                    {notification.body}
                  </span>
                ) : null}
                <span className="text-muted-foreground mt-1 block text-xs">
                  {timeAgo(notification.createdAt)}
                </span>
              </button>

              <button
                type="button"
                onClick={() => void remove(notification.id)}
                className="text-muted-foreground hover:text-destructive grid size-8 shrink-0 place-items-center rounded-lg transition-colors"
                aria-label={`Dismiss: ${notification.title}`}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
