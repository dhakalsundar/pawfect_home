export type NotificationType =
  | 'application_submitted'
  | 'application_status_changed'
  | 'new_message'
  | 'pet_approved'
  | 'pet_rejected'
  | 'shelter_approved'
  | 'shelter_rejected'
  | 'new_review'
  | 'donation_received'
  | 'pet_adopted'
  | 'system';

/** Mirrors NotificationDTO in backend/src/modules/notifications/notifications.service.ts. */
export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

/** Short relative time — "3m", "2h", "5d" — for a dropdown where space is tight. */
export function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}
