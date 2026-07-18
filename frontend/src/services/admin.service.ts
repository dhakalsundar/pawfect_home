import { http } from './http';
import type { User, UserRole, UserStatus } from '@/types/auth';

/** Browser-side admin mutations. See the service-layer note in CLAUDE.md. */
export const adminService = {
  setUserRole: (userId: string, role: UserRole) =>
    http.put<User>(`/admin/users/${userId}/role`, { role }).then((r) => r.data),

  setUserStatus: (userId: string, status: UserStatus, note?: string) =>
    http.put<User>(`/admin/users/${userId}/status`, { status, note }).then((r) => r.data),

  reviewShelter: (shelterId: string, status: 'approved' | 'rejected' | 'suspended', reason?: string) =>
    http
      .put<{ id: string; name: string; status: string }>(`/admin/shelters/${shelterId}/status`, {
        status,
        reason,
      })
      .then((r) => r.data),

  moderatePet: (petId: string, action: 'approve' | 'reject' | 'feature' | 'unfeature', note?: string) =>
    http.put(`/admin/pets/${petId}/moderate`, { action, note }).then((r) => r.data),
};
