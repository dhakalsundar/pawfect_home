import { http } from './http';
import type { Donation, DonationStats, PaymentMethod } from '@/types/donation';

export interface CheckoutInput {
  /** Integer minor units (paisa). */
  amount: number;
  shelterId?: string;
  petId?: string;
  message?: string;
  isAnonymous: boolean;
  type: 'one_time' | 'monthly';
  paymentMethod: PaymentMethod;
  donorName?: string;
  donorEmail?: string;
}

/**
 * What checkout returns, discriminated by method:
 *  - `esewa` → form fields the browser POSTs to eSewa
 *  - `stripe` → a hosted-checkout URL to redirect to
 *  - `cod`   → nothing to redirect to; the pledge is recorded
 */
export type CheckoutResult =
  | { paymentMethod: 'esewa'; donationId: string; esewa: { url: string; fields: Record<string, string> } }
  | { paymentMethod: 'stripe'; donationId: string; url: string | null }
  | { paymentMethod: 'cod'; donationId: string; status: 'pending' };

export type EsewaVerifyOutcome =
  | 'succeeded'
  | 'duplicate'
  | 'invalid_signature'
  | 'amount_mismatch'
  | 'not_complete'
  | 'unknown';

/** Browser-side donation calls. See the service-layer note in CLAUDE.md. */
export const donationsService = {
  checkout: (input: CheckoutInput) =>
    http.post<CheckoutResult>('/donations/checkout', input).then((r) => r.data),

  /** Posts the eSewa redirect blob to the backend, which verifies and settles server-side. */
  verifyEsewa: (data: string) =>
    http
      .post<{ outcome: EsewaVerifyOutcome; donation?: Donation }>('/donations/esewa/verify', { data })
      .then((r) => r.data),

  /** Shelter/admin: confirm a cash-on-delivery pledge as received. */
  markReceived: (id: string) =>
    http.put<Donation>(`/donations/${id}/mark-received`).then((r) => r.data),

  list: (params?: { page?: number; limit?: number; status?: string }) =>
    http.get<Donation[]>('/donations', { params: { ...params } }),

  get: (id: string) => http.get<Donation>(`/donations/${id}`).then((r) => r.data),

  stats: (shelterId?: string) =>
    http.get<DonationStats>('/donations/stats', { params: shelterId ? { shelterId } : {} }).then((r) => r.data),
};
