/**
 * The single money-formatting boundary on the frontend.
 *
 * Mirrors `backend/src/utils/currency.ts` exactly. Money is integer minor units (paisa, 1/100 NPR)
 * everywhere in the app; this is the one place it becomes a string, and the only place division by
 * 100 happens. Import `formatCurrency` rather than writing `Rs. ${x}` inline, so the whole product
 * reads money the same way.
 *
 * Two representations flow through here:
 *   - donation amounts are minor units       → formatCurrency(paisa)
 *   - a pet's adoptionFee is whole rupees     → formatCurrency(rupees, { minorUnits: false })
 *
 * The `Rs.` prefix is fixed rather than taken from `Intl`, whose NPR symbol varies by ICU version.
 */

export const CURRENCY_CODE = 'npr';

interface FormatOptions {
  /** True (default) when `amount` is minor units (paisa) and must be divided by 100. */
  minorUnits?: boolean;
}

export function formatCurrency(amount: number, { minorUnits = true }: FormatOptions = {}): string {
  const rupees = minorUnits ? amount / 100 : amount;
  const hasPaisa = minorUnits && amount % 100 !== 0;

  const number = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: hasPaisa ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(rupees);

  return `Rs. ${number}`;
}
