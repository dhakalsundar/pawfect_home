/**
 * The single money-formatting boundary on the backend.
 *
 * Everything upstream stays in integer minor units (paisa, 1/100 NPR) — the same invariant the
 * whole codebase leans on. This is the one place division by 100 is allowed, and it exists so no
 * handler ever hand-rolls `Rs. ${x / 100}` and drifts from the rest.
 *
 * Deterministic output (`Rs. 2,500` / `Rs. 2,500.50`): the NPR symbol that `Intl` emits varies by
 * ICU version — "₨", "NPRs", "Rs" — so the prefix is fixed here and `Intl` is used only for the
 * grouped number, which is stable.
 */

export const CURRENCY_CODE = 'npr';

interface FormatOptions {
  /** True (default) when `amount` is minor units (paisa) and must be divided by 100. */
  minorUnits?: boolean;
}

export function formatCurrency(amount: number, { minorUnits = true }: FormatOptions = {}): string {
  const rupees = minorUnits ? amount / 100 : amount;

  // Only show paisa when there actually are any — Rs. 2,500, not Rs. 2,500.00.
  const hasPaisa = minorUnits && amount % 100 !== 0;

  const number = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: hasPaisa ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(rupees);

  return `Rs. ${number}`;
}
