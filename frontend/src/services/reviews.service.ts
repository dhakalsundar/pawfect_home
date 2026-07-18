import { http } from './http';
import type { RatingBreakdown, Review } from '@/types/review';

export interface CreateReviewInput {
  shelterId: string;
  rating: number;
  title?: string;
  comment: string;
}

/** Browser-side review calls. See the service-layer note in CLAUDE.md. */
export const reviewsService = {
  list: (params?: { shelterId?: string; rating?: number; page?: number; limit?: number; sort?: string }) =>
    http.get<Review[]>('/reviews', { params: { ...params } }),

  breakdown: (shelterId: string) =>
    http.get<RatingBreakdown>(`/reviews/breakdown/${shelterId}`).then((r) => r.data),

  create: (input: CreateReviewInput) => http.post<Review>('/reviews', input).then((r) => r.data),

  update: (id: string, updates: { rating?: number; title?: string; comment?: string }) =>
    http.put<Review>(`/reviews/${id}`, updates).then((r) => r.data),

  remove: (id: string) => http.delete<{ deleted: boolean }>(`/reviews/${id}`).then((r) => r.data),

  toggleHelpful: (id: string) =>
    http.post<{ helpfulCount: number; markedHelpful: boolean }>(`/reviews/${id}/helpful`).then((r) => r.data),

  reply: (id: string, body: string) =>
    http.post<Review>(`/reviews/${id}/reply`, { body }).then((r) => r.data),

  moderate: (id: string, status: 'approved' | 'rejected', note?: string) =>
    http.put<Review>(`/reviews/${id}/moderate`, { status, ...(note ? { note } : {}) }).then((r) => r.data),

  mine: (params?: { page?: number; limit?: number }) =>
    http.get<Review[]>('/reviews/mine', { params: { ...params } }),

  mineForShelter: (shelterId: string) =>
    http.get<Review | null>(`/reviews/mine/${shelterId}`).then((r) => r.data),

  moderationQueue: (params?: { status?: string; page?: number; limit?: number }) =>
    http.get<Review[]>('/reviews/moderation/queue', { params: { ...params } }),
};
