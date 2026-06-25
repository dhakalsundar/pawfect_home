import 'server-only';

import { serverHttp } from './server-http';
import type { PublicShelter } from '@/types/shelter';
import type { PaginationMeta } from '@/types/api';

const EMPTY_META: PaginationMeta = {
  page: 1, limit: 12, total: 0, totalPages: 0, hasNext: false, hasPrev: false,
};

/** Public shelter profiles. Read-only and unauthenticated, so responses are cacheable by tag. */
export const sheltersServer = {
  list: async (params?: { q?: string; city?: string; state?: string; sort?: string; page?: number }) => {
    const { data, meta } = await serverHttp.get<PublicShelter[]>('/shelters', {
      withAuth: false,
      params: { ...params },
      next: { revalidate: 300, tags: ['shelters'] },
    });
    return { items: data, meta: meta ?? EMPTY_META };
  },

  bySlug: async (slug: string): Promise<PublicShelter> => {
    const { data } = await serverHttp.get<PublicShelter>(`/shelters/${slug}`, {
      withAuth: false,
      next: { revalidate: 300, tags: ['shelters'] },
    });
    return data;
  },
};
