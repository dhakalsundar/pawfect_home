import 'server-only';

import { serverHttp } from './server-http';
import type { Donation, DonationStats } from '@/types/donation';
import type { PaginationMeta } from '@/types/api';

const EMPTY_STATS: DonationStats = { total: 0, count: 0, donorCount: 0, recent: [] };

/** Server Component donation reads. Split from the browser service — see CLAUDE.md. */
export const donationsServer = {
  /**
   * Public totals. Falls back to zeros rather than throwing: the donate page should still render
   * its form and copy if the stats query fails — a broken banner must not take the page down.
   */
  stats: async (shelterId?: string): Promise<DonationStats> => {
    try {
      const { data } = await serverHttp.get<DonationStats>('/donations/stats', {
        params: shelterId ? { shelterId } : {},
      });
      return data;
    } catch {
      return EMPTY_STATS;
    }
  },

  list: async (params?: { page?: number; limit?: number }) => {
    const { data, meta } = await serverHttp.get<Donation[]>('/donations', { params: { ...params } });
    return {
      items: data,
      meta: meta ?? { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
    } satisfies { items: Donation[]; meta: PaginationMeta };
  },
};
