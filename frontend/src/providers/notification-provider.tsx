'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from './auth-provider';
import { useSocket } from './socket-provider';
import { notificationsService } from '@/services/notifications.service';
import type { AppNotification } from '@/types/notification';

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  connected: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

/**
 * Owns the notification list, listening on the shared socket from <SocketProvider>.
 *
 * The socket is an enhancement: every notification is persisted server-side first, so the list is
 * always reconciled from the API on mount and on every reconnect. A dropped connection loses
 * nothing — it just delays delivery until the next fetch.
 */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const { socket, connected } = useSocket();
  const router = useRouter();

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const { data } = await notificationsService.list({ limit: 20 });
      setNotifications(data);
      const { unreadCount: count } = await notificationsService.unreadCount();
      setUnreadCount(count);
    } catch {
      // A failed refresh should leave the previous list intact rather than blanking the panel.
    }
  }, [isAuthenticated]);

  /**
   * Clear the list whenever the signed-in user changes — including to nobody.
   *
   * Adjusted during render rather than in an effect: an effect would render once showing the
   * previous user's notifications, then re-render empty. Comparing against the last id lets React
   * discard the in-progress render before anything is committed, so the old user's data is never
   * painted for the new one.
   */
  const currentUserId = user?.id ?? null;
  const [lastUserId, setLastUserId] = useState(currentUserId);
  if (currentUserId !== lastUserId) {
    setLastUserId(currentUserId);
    setNotifications([]);
    setUnreadCount(0);
  }

  useEffect(() => {
    if (!socket) return;

    /**
     * The list is loaded from the API here rather than in the effect body.
     *
     * `connect` fires on the first connection and on every reconnect, so this one path covers the
     * initial load *and* catches up on anything that happened while disconnected — the server is
     * always authoritative. `connect_error` covers the case where sockets are unreachable
     * entirely (a proxy blocking both transports), so notifications still load over plain HTTP.
     */
    const onConnect = () => void refresh();
    socket.on('connect', onConnect);
    socket.on('connect_error', onConnect);

    const onNew = (payload: { notification: AppNotification; unreadCount: number }) => {
      setNotifications((current) => {
        // Guard against a duplicate if a refresh and a push race each other.
        if (current.some((item) => item.id === payload.notification.id)) return current;
        return [payload.notification, ...current].slice(0, 20);
      });
      setUnreadCount(payload.unreadCount);

      toast(payload.notification.title, {
        description: payload.notification.body,
        action: payload.notification.link
          ? { label: 'View', onClick: () => router.push(payload.notification.link!) }
          : undefined,
      });
    };

    // Emitted when another tab marks something read, so every open tab's badge agrees.
    const onRead = (payload: { unreadCount: number }) => setUnreadCount(payload.unreadCount);

    socket.on('notification:new', onNew);
    socket.on('notification:read', onRead);

    /**
     * Remove only OUR listeners; the socket itself belongs to <SocketProvider> and outlives this
     * effect. Calling `disconnect()` here — as this did when it owned the connection — would now
     * tear the shared socket out from under messaging too.
     */
    return () => {
      socket.off('connect', onConnect);
      socket.off('connect_error', onConnect);
      socket.off('notification:new', onNew);
      socket.off('notification:read', onRead);
    };
  }, [socket, refresh, router]);

  const markRead = useCallback(async (id: string) => {
    // Optimistic: the badge should drop the instant it is clicked.
    setNotifications((current) =>
      current.map((item) => (item.id === id ? { ...item, isRead: true } : item)),
    );
    setUnreadCount((count) => Math.max(0, count - 1));

    try {
      const { unreadCount: count } = await notificationsService.markRead(id);
      setUnreadCount(count);
    } catch {
      // The server is authoritative — re-sync rather than guessing at a rollback.
      await refresh();
    }
  }, [refresh]);

  const markAllRead = useCallback(async () => {
    setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
    setUnreadCount(0);
    try {
      await notificationsService.markAllRead();
    } catch {
      await refresh();
    }
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    const previous = notifications;
    setNotifications((current) => current.filter((item) => item.id !== id));
    try {
      const { unreadCount: count } = await notificationsService.remove(id);
      setUnreadCount(count);
    } catch {
      setNotifications(previous);
    }
  }, [notifications]);

  const value = useMemo<NotificationContextValue>(
    () => ({ notifications, unreadCount, connected, markRead, markAllRead, remove, refresh }),
    [notifications, unreadCount, connected, markRead, markAllRead, remove, refresh],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used inside a <NotificationProvider>.');
  return context;
}
