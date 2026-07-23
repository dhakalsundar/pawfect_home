'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, Check, CheckCheck, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/providers/auth-provider';
import { useNotifications } from '@/providers/notification-provider';
import { timeAgo } from '@/types/notification';
import { cn } from '@/lib/utils';

export function NotificationBell() {
  const { isAuthenticated } = useAuth();
  const { notifications, unreadCount, markRead, markAllRead, connected } = useNotifications();
  const router = useRouter();

  // Nothing to show when signed out; the sign-in buttons occupy this space instead.
  if (!isAuthenticated) return null;

  async function open(id: string, link?: string) {
    await markRead(id);
    if (link) router.push(link);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-9"
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : 'Notifications'
          }
        >
          <Bell className="size-4" />
          {unreadCount > 0 ? (
            <span
              className="bg-primary absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold text-white tabular-nums"
              // The accessible name on the button already states the count, so this is decorative.
              aria-hidden="true"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Notifications</h2>
            {/* Quiet reassurance that live updates are working, without shouting about it. */}
            <span
              className={cn(
                'size-1.5 rounded-full',
                connected ? 'bg-success' : 'bg-muted-foreground/40',
              )}
              title={connected ? 'Live' : 'Reconnecting…'}
            />
          </div>
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors"
            >
              <CheckCheck className="size-3.5" />
              Mark all read
            </button>
          ) : null}
        </div>

        <Separator />

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <span className="bg-muted text-muted-foreground grid size-10 place-items-center rounded-xl">
              <Inbox className="size-5" />
            </span>
            <p className="text-sm font-medium">You&apos;re all caught up</p>
            <p className="text-muted-foreground text-xs">
              Updates about your applications appear here.
            </p>
          </div>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {notifications.map((notification) => (
              <li key={notification.id}>
                <button
                  type="button"
                  onClick={() => void open(notification.id, notification.link)}
                  className={cn(
                    'hover:bg-muted/60 flex w-full gap-3 px-4 py-3 text-left transition-colors',
                    !notification.isRead && 'bg-brand-50/50',
                  )}
                >
                  <span
                    className={cn(
                      'mt-1.5 size-2 shrink-0 rounded-full',
                      notification.isRead ? 'bg-transparent' : 'bg-primary',
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{notification.title}</span>
                    {notification.body ? (
                      <span className="text-muted-foreground mt-0.5 block text-xs leading-relaxed">
                        {notification.body}
                      </span>
                    ) : null}
                    <span className="text-muted-foreground mt-1 block text-[11px]">
                      {timeAgo(notification.createdAt)}
                    </span>
                  </span>
                  {!notification.isRead ? (
                    <Check className="text-muted-foreground/50 mt-1 size-3.5 shrink-0" aria-hidden="true" />
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}

        <Separator />

        <div className="p-2">
          <Button asChild variant="ghost" size="sm" className="w-full">
            <Link href="/dashboard/notifications">See all notifications</Link>
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
