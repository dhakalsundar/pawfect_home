import { http } from './http';
import type { ChatMessage, ConversationSummary, MessagePage } from '@/types/message';

/** Browser-side messaging calls. See the service-layer note in CLAUDE.md. */
export const messagesService = {
  listConversations: () =>
    http.get<ConversationSummary[]>('/conversations').then((r) => r.data),

  /** Idempotent — returns the existing thread if one already exists for this pair and pet. */
  start: (input: { recipientId?: string; petId?: string }) =>
    http.post<ConversationSummary>('/conversations', input).then((r) => r.data),

  listMessages: (conversationId: string, params?: { before?: string; limit?: number }) =>
    http
      .get<MessagePage>(`/conversations/${conversationId}/messages`, { params: { ...params } })
      .then((r) => r.data),

  send: (conversationId: string, body: string) =>
    http.post<ChatMessage>(`/conversations/${conversationId}/messages`, { body }).then((r) => r.data),

  markRead: (conversationId: string) =>
    http.put<{ unread: number }>(`/conversations/${conversationId}/read`).then((r) => r.data),

  unreadCount: () =>
    http.get<{ unreadCount: number }>('/conversations/unread-count').then((r) => r.data),
};
