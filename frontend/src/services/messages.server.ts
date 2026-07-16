import 'server-only';

import { serverHttp } from './server-http';
import type { ConversationSummary } from '@/types/message';

/** Server Component messaging reads. Split from the browser service — see CLAUDE.md. */
export const messagesServer = {
  /**
   * The inbox list for first paint. Returns an empty list on failure rather than throwing: an
   * unreachable API should render the empty state, not blow up the whole dashboard route.
   */
  listConversations: async (): Promise<ConversationSummary[]> => {
    try {
      const { data } = await serverHttp.get<ConversationSummary[]>('/conversations');
      return data;
    } catch {
      return [];
    }
  },
};
