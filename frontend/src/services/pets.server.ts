import 'server-only';

import { serverHttp } from './server-http';
import type { PaginationMeta } from '@/types/api';
import type { Pet, PetDetail, PetFacets, PetQuery } from '@/types/pet';

/**
 * Server Component pet reads.
 *
 * Split out of `pets.service.ts` in Batch 15. That module imported BOTH http clients, so the first
 * client component to import anything from it — even just the `PetQuery` type — would have pulled
 * `server-only` into the browser bundle and failed the build. See the service-layer note in
 * CLAUDE.md.
 */


/** Drops empty values so the query string stays clean and cache keys stay stable. */
function toParams(query: PetQuery): Record<string, string | number | boolean> {
  const params: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    params[key] = value as string | number | boolean;
  }
  return params;
}

export const petsServer = {
  /** Server Components. Public data, so no cookies are forwarded and it can be cached by tag. */
  listServer: async (query: PetQuery): Promise<{ items: Pet[]; meta: PaginationMeta }> => {
    const { data, meta } = await serverHttp.get<Pet[]>('/pets', {
      params: toParams(query),
      withAuth: false,
      next: { revalidate: 60, tags: ['pets'] },
    });
    return {
      items: data,
      meta: meta ?? { page: 1, limit: 24, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
    };
  },

  facetsServer: async (query: PetQuery): Promise<PetFacets> => {
    const { data } = await serverHttp.get<PetFacets>('/pets/facets', {
      params: toParams(query),
      withAuth: false,
      next: { revalidate: 300, tags: ['pets'] },
    });
    return data;
  },

  getBySlugServer: async (slug: string): Promise<PetDetail> => {
    const { data } = await serverHttp.get<PetDetail>(`/pets/${encodeURIComponent(slug)}`, {
      withAuth: false,
      // Tagged individually so Batch 8 can revalidate exactly this pet when a shelter edits it,
      // rather than blowing away every cached listing.
      next: { revalidate: 300, tags: ['pets', `pet:${slug}`] },
    });
    return data;
  },

  similarServer: async (slug: string): Promise<Pet[]> => {
    const { data } = await serverHttp.get<Pet[]>(`/pets/${encodeURIComponent(slug)}/similar`, {
      withAuth: false,
      next: { revalidate: 300, tags: ['pets'] },
    });
    return data;
  },

  featuredServer: async (): Promise<Pet[]> => {
    const { data } = await serverHttp.get<Pet[]>('/pets/featured', {
      withAuth: false,
      next: { revalidate: 300, tags: ['pets'] },
    });
    return data;
  },
};
