export interface ConversationSummary {
  id: string;
  other: { id: string; name: string; avatar?: string };
  pet?: { id: string; slug: string; name: string; image: string };
  shelter?: { id: string; name: string; slug: string };
  lastMessage?: { body: string; at: string; fromMe: boolean };
  unread: number;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  /**
   * Set on messages that exist only in the sender's UI, awaiting the server's reply.
   * Never sent by the API.
   */
  pending?: boolean;
  failed?: boolean;
}

export interface MessagePage {
  items: ChatMessage[];
  nextCursor: string | null;
}
