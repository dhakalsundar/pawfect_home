'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from '@/providers/socket-provider';
import { messagesService } from '@/services/messages.service';
import type { ChatMessage } from '@/types/message';

/**
 * ObjectId hex is monotonic in time (4-byte timestamp, then a counter), so comparing ids breaks
 * ties when several messages share a `createdAt` millisecond — the same reason the server's index
 * ends with `_id`. Without this the thread reads out of order under rapid sends.
 */
function byOrder(a: ChatMessage, b: ChatMessage): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : 1;
}

/** Inserts in order, replacing the optimistic placeholder if this is its server-assigned twin. */
function merge(current: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
  if (current.some((message) => message.id === incoming.id)) return current;

  const withoutPlaceholder = current.filter(
    (message) => !(message.pending && message.body === incoming.body),
  );

  return [...withoutPlaceholder, incoming].sort(byOrder);
}

export function useThread(conversationId: string, currentUserId: string | undefined) {
  const { socket } = useSocket();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Load the thread, then mark it read — opening a conversation clearing its badge is the batch
   * gate. The hook is remounted per conversation (see the `key` in <MessagesInbox>), so this runs
   * once per thread and needs no reset branch.
   */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const page = await messagesService.listMessages(conversationId);
        if (cancelled) return;
        setMessages(page.items);
        setCursor(page.nextCursor);
        await messagesService.markRead(conversationId);
      } catch {
        if (!cancelled) setMessages([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  /**
   * Join the conversation room.
   *
   * The server verifies membership before honouring this — see the note in `sockets/index.ts`.
   * The ack tells us whether the join was accepted; a rejection simply means no live updates,
   * and the REST fetch above has already failed for the same reason.
   */
  useEffect(() => {
    if (!socket || !conversationId) return;

    socket.emit('conversation:join', conversationId);

    const onNew = (message: ChatMessage) => {
      if (message.conversationId !== conversationId) return;
      setMessages((current) => merge(current, message));
      // Anything arriving while the thread is open is read on arrival.
      if (message.senderId !== currentUserId) void messagesService.markRead(conversationId);
    };

    const onTyping = (payload: { conversationId: string; userId: string; isTyping: boolean }) => {
      if (payload.conversationId !== conversationId || payload.userId === currentUserId) return;
      setOtherTyping(payload.isTyping);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      // Clear on a timer as well as on the stop event: if the other tab closes mid-type, the
      // "stopped" event never arrives and the indicator would hang forever.
      if (payload.isTyping) typingTimer.current = setTimeout(() => setOtherTyping(false), 4000);
    };

    socket.on('message:new', onNew);
    socket.on('typing', onTyping);

    return () => {
      socket.emit('conversation:leave', conversationId);
      socket.off('message:new', onNew);
      socket.off('typing', onTyping);
      setOtherTyping(false);
    };
  }, [socket, conversationId, currentUserId]);

  const loadOlder = useCallback(async () => {
    if (!conversationId || !cursor || loading) return;
    setLoading(true);
    try {
      const page = await messagesService.listMessages(conversationId, { before: cursor });
      setMessages((current) => [...page.items, ...current].sort(byOrder));
      setCursor(page.nextCursor);
    } finally {
      setLoading(false);
    }
  }, [conversationId, cursor, loading]);

  const send = useCallback(
    async (body: string) => {
      const trimmed = body.trim();
      if (!conversationId || !trimmed || !currentUserId) return;

      // Optimistic placeholder so the bubble appears instantly. Keyed with a temporary id that
      // sorts last; `merge` swaps it for the server's copy when the socket echoes it back.
      const placeholder: ChatMessage = {
        id: `pending-${Date.now()}`,
        conversationId,
        senderId: currentUserId,
        body: trimmed,
        createdAt: new Date().toISOString(),
        pending: true,
      };
      setMessages((current) => [...current, placeholder]);
      setSending(true);

      try {
        const saved = await messagesService.send(conversationId, trimmed);
        setMessages((current) => merge(current, saved));
      } catch {
        setMessages((current) =>
          current.map((message) =>
            message.id === placeholder.id ? { ...message, pending: false, failed: true } : message,
          ),
        );
      } finally {
        setSending(false);
      }
    },
    [conversationId, currentUserId],
  );

  const setTyping = useCallback(
    (isTyping: boolean) => {
      if (!socket || !conversationId) return;
      socket.emit('typing', { conversationId, isTyping });
    },
    [socket, conversationId],
  );

  return { messages, loading, sending, otherTyping, hasMore: Boolean(cursor), loadOlder, send, setTyping };
}
