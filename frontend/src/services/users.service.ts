import { http } from './http';
import type { User } from '@/types/auth';

export interface UpdateProfilePayload {
  name?: string;
  phone?: string;
  bio?: string;
  avatar?: { url: string; publicId: string };
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    zip?: string;
  };
}

export interface UserStats {
  favorites: number;
  applications: number;
  activeApplications: number;
  adoptions: number;
}

/** Browser-side user calls. See the service-layer note in CLAUDE.md. */
export const usersService = {
  updateProfile: (payload: UpdateProfilePayload) =>
    http.put<User>('/users/me', payload).then((r) => r.data),

  updatePreferences: (payload: Partial<User['preferences']>) =>
    http.put<User>('/users/me/preferences', payload).then((r) => r.data),

  // Body rather than query params: the confirmation phrase and password must not land in
  // proxy or server logs.
  deleteAccount: (confirm: 'DELETE', password?: string) =>
    http.delete<{ deleted: boolean }>('/users/me', { confirm, password }).then((r) => r.data),
};
