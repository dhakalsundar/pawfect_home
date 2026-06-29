import { http } from './http';

/** Browser-side favourites. See the service-layer note in CLAUDE.md — no server-http here. */
export const favoritesService = {
  toggle: (petId: string) =>
    http.post<{ favorited: boolean }>('/favorites/toggle', { petId }).then((r) => r.data),

  add: (petId: string) =>
    http.post<{ favorited: boolean }>('/favorites', { petId }).then((r) => r.data),

  remove: (petId: string) =>
    http.delete<{ favorited: boolean }>(`/favorites/${petId}`).then((r) => r.data),

  ids: () => http.get<string[]>('/favorites/ids').then((r) => r.data),
};
