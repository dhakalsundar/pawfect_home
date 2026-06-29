import { http } from './http';
import type { PetQuery } from '@/types/pet';
import type { Pet } from '@/types/pet';

/** Drops empty values so the query string stays clean. */
function toParams(query: PetQuery): Record<string, string | number | boolean> {
  const params: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    params[key] = value as string | number | boolean;
  }
  return params;
}

/**
 * Browser-side pet reads. Server Components use `pets.server.ts`.
 *
 * These two must never live in one module: importing both HTTP clients means a client component
 * touching this file drags `server-only` into the browser bundle and the build fails.
 */
export const petsService = {
  list: async (query: PetQuery) => {
    const { data, meta } = await http.get<Pet[]>('/pets', { params: toParams(query) });
    return { items: data, meta };
  },
};
