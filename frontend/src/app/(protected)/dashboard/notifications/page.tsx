import type { Metadata } from 'next';
import { NotificationList } from '@/features/notifications/components/notification-list';

export const metadata: Metadata = {
  title: 'Notifications',
  robots: { index: false, follow: false },
};

/**
 * The full list is a client component because it shares the provider's live state with the bell —
 * rendering it server-side would show a snapshot that immediately drifts from the badge.
 */
export default function NotificationsPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Notifications</h1>
        <p className="text-muted-foreground mt-1">Updates about your applications and messages.</p>
      </div>

      <NotificationList />
    </div>
  );
}
