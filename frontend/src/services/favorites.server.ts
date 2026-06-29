import 'server-only';

import { serverHttp } from './server-http';
import type { PaginationMeta } from '@/types/api';
import type { Pet } from '@/types/pet';

export type FavoritePet = Pet & { favoritedAt: string };

/** Server Component favourites. Split from the browser service — see CLAUDE.md. */
export const favoritesServer = {
  list: async (params?: { page?: number; limit?: number }) => {
    const { data, meta } = await serverHttp.get<FavoritePet[]>('/favorites', {
      params: { ...params },
    });
    return {
      items: data,
      meta: meta ?? { page: 1, limit: 24, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
    } satisfies { items: FavoritePet[]; meta: PaginationMeta };
  },

  /**
   * The set of favourited pet ids, for hydrating hearts across a grid.
   * Returns an empty array when signed out, so callers need no auth branch.
   */
  ids: async (): Promise<string[]> => {
    try {
      const { data } = await serverHttp.get<string[]>('/favorites/ids');
      return data;
    } catch {
      return [];
    }
  },
};
