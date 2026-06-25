import 'server-only';

import { serverHttp } from './server-http';
import type { PaginationMeta } from '@/types/api';
import type { Application } from '@/types/adoption';

/**
 * Server Component adoption calls.
 *
 * Split from `adoptions.service.ts` because that file is imported by client components, and
 * `server-http` is marked `server-only` — mixing them fails the build the moment a client
 * component touches the shared module. Keeping the split explicit means the boundary is enforced
 * by the bundler rather than by remembering.
 */
export const adoptionsServer = {
  list: async (params?: { status?: string; page?: number }) => {
    const { data, meta } = await serverHttp.get<Application[]>('/adoptions', { params: { ...params } });
    return {
      items: data,
      meta: meta ?? { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
    } satisfies { items: Application[]; meta: PaginationMeta };
  },

  get: async (id: string) => {
    const { data } = await serverHttp.get<Application>(`/adoptions/${id}`);
    return data;
  },

  /**
   * Whether the signed-in user already has an open application for this pet.
   * Returns null when signed out or when there is none — callers treat both identically.
   */
  forPet: async (petId: string): Promise<{ id: string; status: string } | null> => {
    try {
      const { data } = await serverHttp.get<{ id: string; status: string } | null>(
        `/adoptions/for-pet/${petId}`,
      );
      return data;
    } catch {
      return null;
    }
  },
};
