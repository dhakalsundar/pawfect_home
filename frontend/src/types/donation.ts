import { formatCurrency } from '@/lib/currency';

export type DonationStatus = 'pending' | 'succeeded' | 'failed' | 'refunded';

export type PaymentMethod = 'stripe' | 'esewa' | 'cod';

export interface Donation {
  id: string;
  /** Integer minor units (paisa) — never divide except at the display boundary. */
  amount: number;
  currency: string;
  type: 'one_time' | 'monthly';
  paymentMethod: PaymentMethod;
  status: DonationStatus;
  donorName: string;
  message?: string;
  isAnonymous: boolean;
  shelter?: { id: string; name: string; slug: string };
  pet?: { id: string; name: string; slug: string };
  receiptUrl?: string;
  createdAt: string;
}

export interface DonationStats {
  total: number;
  count: number;
  donorCount: number;
  recent: Donation[];
}

/**
 * Minor units (paisa) → display string.
 *
 * Kept as a named export because it is imported in several places; it now delegates to the shared
 * `formatCurrency` so there is one NPR formatter for the whole app. The second argument is ignored
 * (donation rows carry `currency: 'npr'`); it remains only so existing call sites need no edit.
 */
export function formatMoney(paisa: number): string {
  return formatCurrency(paisa);
}

/** Preset amounts, in minor units (paisa): Rs 500 / Rs 1,000 / Rs 2,500 / Rs 5,000. */
export const DONATION_PRESETS = [50000, 100000, 250000, 500000] as const;
