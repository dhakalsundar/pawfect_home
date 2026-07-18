import 'server-only';

import { serverHttp } from './server-http';
import type { RatingBreakdown, Review } from '@/types/review';
import type { PaginationMeta } from '@/types/api';

const EMPTY_META: PaginationMeta = {
  page: 1, limit: 10, total: 0, totalPages: 0, hasNext: false, hasPrev: false,
};
const EMPTY_BREAKDOWN: RatingBreakdown = {
  average: 0, count: 0, distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
};

/** Server Component review reads. Split from the browser service — see CLAUDE.md. */
export const reviewsServer = {
  /**
   * Reviews for one shelter. Degrades to an empty list rather than throwing: a review section
   * failing to load must not take down the page it sits on.
   */
  forShelter: async (shelterId: string, params?: { limit?: number; sort?: string }) => {
    try {
      const { data, meta } = await serverHttp.get<Review[]>('/reviews', {
        params: { shelterId, ...params },
      });
      return { items: data, meta: meta ?? EMPTY_META };
    } catch {
      return { items: [] as Review[], meta: EMPTY_META };
    }
  },

  breakdown: async (shelterId: string): Promise<RatingBreakdown> => {
    try {
      const { data } = await serverHttp.get<RatingBreakdown>(`/reviews/breakdown/${shelterId}`);
      return data;
    } catch {
      return EMPTY_BREAKDOWN;
    }
  },

  /** The caller's own shelter reviews — the shelter is resolved from the session, not the URL. */
  forMyShelter: async (params?: { page?: number; limit?: number }) => {
    try {
      const { data, meta } = await serverHttp.get<Review[]>('/reviews/shelter/mine', {
        params: { ...params },
      });
      return { items: data, meta: meta ?? EMPTY_META };
    } catch {
      return { items: [] as Review[], meta: EMPTY_META };
    }
  },

  myShelterBreakdown: async (): Promise<RatingBreakdown> => {
    try {
      const { data } = await serverHttp.get<RatingBreakdown>('/reviews/shelter/mine/breakdown');
      return data;
    } catch {
      return EMPTY_BREAKDOWN;
    }
  },

  mine: async (params?: { page?: number; limit?: number }) => {
    const { data, meta } = await serverHttp.get<Review[]>('/reviews/mine', { params: { ...params } });
    return { items: data, meta: meta ?? EMPTY_META };
  },

  moderationQueue: async (params?: { status?: string; page?: number; limit?: number }) => {
    const { data, meta } = await serverHttp.get<Review[]>('/reviews/moderation/queue', {
      params: { ...params },
    });
    return { items: data, meta: meta ?? EMPTY_META };
  },
};
