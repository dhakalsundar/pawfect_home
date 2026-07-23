'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useSocket } from '@/providers/socket-provider';
import { messagesService } from '@/services/messages.service';
import { cn } from '@/lib/utils';
import { ConversationList } from './conversation-list';
import { MessageThread } from './message-thread';
import type { ConversationSummary } from '@/types/message';

/**
 * Two-pane inbox. The selected conversation lives in the URL (`?c=`) rather than in state, for the
 * same reason the pet filters do: the thread is then shareable, and the back button works.
 */
export function MessagesInbox({ initialConversations }: { initialConversations: ConversationSummary[] }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const router = useRouter();
  const searchParams = useSearchParams();

  const activeId = searchParams.get('c');

  // Seeded from the Server Component, so the list is painted before any JavaScript runs; the
  // socket only ever patches it from here on.
  const [conversations, setConversations] = useState<ConversationSummary[]>(initialConversations);

  const refresh = useCallback(async () => {
    try {
      setConversations(await messagesService.listConversations());
    } catch {
      // Leave the previous list intact rather than blanking the pane.
    }
  }, []);

  /**
   * `message:inbox` is emitted to the recipient's personal room, so the list updates even for
   * threads that are not open. Re-fetching rather than patching locally keeps the unread counts
   * and ordering exactly as the server computed them.
   */
  useEffect(() => {
    if (!socket) return;
    const onInbox = () => void refresh();
    socket.on('message:inbox', onInbox);
    return () => {
      socket.off('message:inbox', onInbox);
    };
  }, [socket, refresh]);

  const active = useMemo(
    () => conversations.find((conversation) => conversation.id === activeId) ?? null,
    [conversations, activeId],
  );

  const select = useCallback(
    (id: string) => {
      // Clear the badge immediately; the thread marks it read server-side as it opens.
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === id ? { ...conversation, unread: 0 } : conversation,
        ),
      );
      router.replace(`/dashboard/messages?c=${id}`, { scroll: false });
    },
    [router],
  );

  return (
    <div className="border-border/60 bg-card shadow-soft grid h-[calc(100vh-14rem)] min-h-[30rem] overflow-hidden rounded-2xl border md:grid-cols-[20rem_1fr]">
      {/* On mobile only one pane shows at a time — the list, until a thread is opened. */}
      <aside
        className={cn(
          'border-border/60 min-h-0 overflow-y-auto md:block md:border-r',
          activeId && 'hidden',
        )}
        aria-label="Conversations"
      >
        <ConversationList conversations={conversations} activeId={activeId} onSelect={select} />
      </aside>

      <section className={cn('min-h-0', !activeId && 'hidden md:block')}>
        {active ? (
          <MessageThread
            // Remount on change so no state leaks between threads.
            key={active.id}
            conversation={active}
            currentUserId={user?.id}
            onBack={() => router.replace('/dashboard/messages', { scroll: false })}
          />
        ) : (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <MessageSquare className="size-10 opacity-40" aria-hidden />
            <p className="text-sm">Select a conversation to read it.</p>
          </div>
        )}
      </section>
    </div>
  );
}
