import 'server-only';

import { serverHttp } from './server-http';
import type { PaginationMeta } from '@/types/api';
import type { Pet, PetDetail } from '@/types/pet';
import type { Application } from '@/types/adoption';

export interface ShelterAnalytics {
  pets: { total: number; available: number; pending: number; reserved: number; adopted: number };
  applications: {
    total: number;
    pending: number;
    underReview: number;
    approved: number;
    rejected: number;
    completed: number;
  };
  engagement: { views: number; favorites: number; conversionRate: number };
  averageDaysToAdopt: number | null;
  topPets: { id: string; name: string; slug: string; views: number; applications: number }[];
  applicationsByMonth: { month: string; count: number }[];
}

const EMPTY_META: PaginationMeta = {
  page: 1,
  limit: 24,
  total: 0,
  totalPages: 0,
  hasNext: false,
  hasPrev: false,
};

export const shelterServer = {
  pets: async (params?: { status?: string; q?: string; page?: number; limit?: number }) => {
    const { data, meta } = await serverHttp.get<Pet[]>('/shelters/me/pets', { params: { ...params } });
    return { items: data, meta: meta ?? EMPTY_META };
  },

  analytics: async (): Promise<ShelterAnalytics> => {
    const { data } = await serverHttp.get<ShelterAnalytics>('/shelters/me/analytics');
    return data;
  },

  applications: async (params?: { status?: string; petId?: string; page?: number }) => {
    const { data, meta } = await serverHttp.get<Application[]>('/adoptions', {
      params: { ...params, limit: 50 },
    });
    return { items: data, meta: meta ?? EMPTY_META };
  },

  pet: async (slug: string): Promise<PetDetail> => {
    // No revalidate: a shelter editing a listing must see its own change immediately, not a
    // cached copy from before the edit.
    const { data } = await serverHttp.get<PetDetail>(`/pets/${encodeURIComponent(slug)}`, {
      cache: 'no-store',
    });
    return data;
  },
};
