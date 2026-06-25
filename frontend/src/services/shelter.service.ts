import { http } from './http';
import type { PetDetail, Species, Gender, PetSize, ActivityLevel, Tristate } from '@/types/pet';

export interface PetFormPayload {
  name: string;
  species: Species;
  breed: string;
  age: { value: number; unit: 'weeks' | 'months' | 'years' };
  gender: Gender;
  size: PetSize;
  color?: string;
  description: string;
  // publicId round-trips so the API can verify the asset is ours and clean up removed photos.
  images: { url: string; publicId?: string; isPrimary?: boolean }[];
  health: {
    vaccinated: boolean;
    neutered: boolean;
    microchipped: boolean;
    specialNeeds: boolean;
    medicalNotes?: string;
  };
  temperament: string[];
  goodWith: { kids: Tristate; dogs: Tristate; cats: Tristate };
  activityLevel: ActivityLevel;
  adoptionFee: number;
}

/** Browser-side shelter mutations. See the service-layer note in CLAUDE.md. */
export const shelterService = {
  createPet: (payload: PetFormPayload) => http.post<PetDetail>('/pets', payload).then((r) => r.data),

  updatePet: (id: string, payload: Partial<PetFormPayload>) =>
    http.put<PetDetail>(`/pets/${id}`, payload).then((r) => r.data),

  setStatus: (id: string, status: 'available' | 'reserved' | 'adopted' | 'archived') =>
    http.patch<PetDetail>(`/pets/${id}/status`, { status }).then((r) => r.data),

  deletePet: (id: string) => http.delete<{ deleted: boolean }>(`/pets/${id}`).then((r) => r.data),

  updateApplicationStatus: (
    id: string,
    status: 'under_review' | 'approved' | 'rejected' | 'completed',
    note?: string,
  ) => http.put(`/adoptions/${id}/status`, { status, note }).then((r) => r.data),
};
