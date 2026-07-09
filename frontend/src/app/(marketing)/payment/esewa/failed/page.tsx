import { redirect } from 'next/navigation';

/**
 * eSewa's failure_url target. eSewa redirects here when a payment is cancelled or declined, so
 * there is nothing to verify — just show the shared failed page. A distinct path (rather than a
 * query flag on the success URL) means the two outcomes never depend on a param eSewa might drop.
 */
export default function EsewaFailedPage() {
  redirect('/donate/failed?method=esewa');
}
