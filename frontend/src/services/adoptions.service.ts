import { http } from './http';
import type { Application, ApplicationAnswers, ApplicationReference } from '@/types/adoption';

/**
 * Browser-side adoption calls.
 *
 * Deliberately does NOT import server-http: that module is marked `server-only`, and a single
 * client component importing this file would drag it into the browser bundle and fail the build.
 * Server Components use `adoptions.server.ts` instead.
 */
export interface SubmitApplicationPayload {
  petId: string;
  answers: ApplicationAnswers;
  references: ApplicationReference[];
  agreedToTerms: true;
}

export const adoptionsService = {
  submit: (payload: SubmitApplicationPayload) =>
    http.post<Application>('/adoptions', payload).then((r) => r.data),

  withdraw: (id: string, reason?: string) =>
    http.put<Application>(`/adoptions/${id}/withdraw`, { reason }).then((r) => r.data),

  updateStatus: (id: string, status: string, note?: string) =>
    http.put<Application>(`/adoptions/${id}/status`, { status, note }).then((r) => r.data),
};
