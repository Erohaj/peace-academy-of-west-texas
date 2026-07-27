/**
 * Reads the query string Stripe appends when it sends the donor back.
 *
 * This app has no router, so the redirect from Checkout lands on the same
 * single page as everything else and the parameters have to be picked up by
 * hand. `success_url` and `cancel_url` are built in the create-checkout-session
 * Edge Function.
 */

export interface DonationReturn {
  status: 'success' | 'cancelled';
  sessionId: string | null;
}

export function readDonationReturn(): DonationReturn | null {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  const donation = params.get('donation');

  if (donation !== 'success' && donation !== 'cancelled') return null;

  return {
    status: donation,
    sessionId: params.get('session_id')
  };
}

/**
 * Strips the donation parameters once they have been consumed, so a refresh or
 * a shared link does not replay the thank-you screen. Uses replaceState to
 * avoid adding a history entry the back button would step through.
 */
export function clearDonationParams(): void {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  url.searchParams.delete('donation');
  url.searchParams.delete('session_id');

  window.history.replaceState({}, '', url.toString());
}
