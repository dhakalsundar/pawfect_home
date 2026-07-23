import { Suspense } from 'react';
import type { Metadata } from 'next';
import { MessagesInbox } from '@/features/messages/components/messages-inbox';
import { messagesServer } from '@/services/messages.server';

export const metadata: Metadata = {
  title: 'Messages',
  robots: { index: false, follow: false },
};

/**
 * The list is fetched here so the inbox paints with content on first load; the client component
 * owns it from then on, because the socket keeps unread counts and ordering live.
 *
 * The <Suspense> boundary is required, not decorative — `useSearchParams` (which holds the
 * selected thread) opts the subtree into client-side rendering and Next fails the build without it.
 */
export default async function MessagesPage() {
  const conversations = await messagesServer.listConversations();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Messages</h1>
        <p className="text-muted-foreground mt-1">
          Your conversations with shelters about their pets.
        </p>
      </div>

      <Suspense
        fallback={
          <div className="bg-muted/60 h-[calc(100vh-14rem)] min-h-[30rem] animate-pulse rounded-2xl" />
        }
      >
        <MessagesInbox initialConversations={conversations} />
      </Suspense>
    </div>
  );
}
