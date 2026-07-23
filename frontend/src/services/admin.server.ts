import 'server-only';

import { serverHttp } from './server-http';
import type { PaginationMeta } from '@/types/api';
import type { Pet } from '@/types/pet';
import type { User, UserRole, UserStatus } from '@/types/auth';

export interface PlatformStats {
  users: { total: number; adopters: number; shelters: number; admins: number; newLast30Days: number };
  pets: {
    total: number;
    available: number;
    pending: number;
    reserved: number;
    adopted: number;
    archived: number;
  };
  shelters: { total: number; approved: number; pending: number; rejected: number; suspended: number };
  applications: {
    total: number;
    pending: number;
    underReview: number;
    approved: number;
    completed: number;
    rejected: number;
  };
  adoptionsByMonth: { month: string; count: number }[];
}

export interface AdminUser extends User {
  lastLoginAt?: string;
}

export interface AdminShelter {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone?: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  rejectionReason?: string;
  city: string;
  state: string;
  registrationNumber?: string;
  stats: { totalPets: number; availablePets: number; adoptedPets: number };
  rating: { average: number; count: number };
  createdAt: string;
  owner?: { name?: string; email?: string };
}

export interface AuditEntry {
  id: string;
  actor: { name: string; email: string };
  action: string;
  entityKind: string;
  entityId: string;
  entityLabel?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  note?: string;
  ip?: string;
  createdAt: string;
}

export type SecuritySeverity = 'info' | 'warning' | 'critical';

export interface SecurityEntry {
  id: string;
  event: string;
  severity: SecuritySeverity;
  actor?: { name: string; email: string };
  emailAttempted?: string;
  ip?: string;
  userAgent?: string;
  method?: string;
  path?: string;
  details?: unknown;
  createdAt: string;
}

export interface SecuritySummary {
  windowHours: number;
  total: number;
  critical: number;
  warning: number;
  info: number;
  byEvent: { event: string; count: number }[];
}

const EMPTY_META: PaginationMeta = {
  page: 1,
  limit: 25,
  total: 0,
  totalPages: 0,
  hasNext: false,
  hasPrev: false,
};

/** Server Component calls for the admin dashboard. Split from the browser service — see CLAUDE.md. */
export const adminServer = {
  stats: async (): Promise<PlatformStats> => {
    const { data } = await serverHttp.get<PlatformStats>('/admin/stats');
    return data;
  },

  users: async (params?: { q?: string; role?: UserRole; status?: UserStatus; page?: number }) => {
    const { data, meta } = await serverHttp.get<AdminUser[]>('/admin/users', { params: { ...params } });
    return { items: data, meta: meta ?? EMPTY_META };
  },

  shelters: async (params?: { status?: string; page?: number }) => {
    const { data, meta } = await serverHttp.get<AdminShelter[]>('/admin/shelters', {
      params: { ...params },
    });
    return { items: data, meta: meta ?? EMPTY_META };
  },

  pets: async (params?: { status?: string; page?: number }) => {
    const { data, meta } = await serverHttp.get<Pet[]>('/admin/pets', { params: { ...params } });
    return { items: data, meta: meta ?? EMPTY_META };
  },

  auditLogs: async (params?: { action?: string; entityKind?: string; page?: number }) => {
    const { data, meta } = await serverHttp.get<AuditEntry[]>('/admin/audit-logs', {
      params: { ...params },
    });
    return { items: data, meta: meta ?? EMPTY_META };
  },

  securityLogs: async (params?: { event?: string; severity?: SecuritySeverity; page?: number }) => {
    const { data, meta } = await serverHttp.get<SecurityEntry[]>('/admin/security-logs', {
      params: { ...params },
    });
    return { items: data, meta: meta ?? EMPTY_META };
  },

  securitySummary: async (): Promise<SecuritySummary> => {
    const { data } = await serverHttp.get<SecuritySummary>('/admin/security-summary');
    return data;
  },
};
