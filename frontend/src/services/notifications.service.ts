import { http } from './http';
import type { AppNotification } from '@/types/notification';

/** Browser-side notification calls. See the service-layer note in CLAUDE.md. */
export const notificationsService = {
  list: (params?: { unread?: boolean; page?: number; limit?: number }) =>
    http.get<AppNotification[]>('/notifications', { params: { ...params } }),

  unreadCount: () =>
    http.get<{ unreadCount: number }>('/notifications/unread-count').then((r) => r.data),

  markRead: (id: string) =>
    http.put<{ unreadCount: number }>(`/notifications/${id}/read`).then((r) => r.data),

  markAllRead: () =>
    http.put<{ unreadCount: number }>('/notifications/read-all').then((r) => r.data),

  remove: (id: string) =>
    http.delete<{ unreadCount: number }>(`/notifications/${id}`).then((r) => r.data),
};
