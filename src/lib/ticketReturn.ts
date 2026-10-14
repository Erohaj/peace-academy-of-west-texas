/**
 * Reads the query string Stripe appends when it sends a ticket buyer back.
 *
 * Separate parameter from the donation return (`?ticket=` rather than
 * `?donation=`) because the two land on different tabs and read different
 * tables: a donation is looked up in `donations` and belongs on the donate
 * tab, a seat in `rsvps` and belongs with the events. Sharing one parameter
 * would mean guessing which from the session id, and guessing wrong shows
 * somebody a donation receipt for a workshop they just paid to attend.
 *
 * `success_url` and `cancel_url` are built in the create-ticket-session Edge
 * Function. This app has no router, so the redirect lands on the same single
 * page as everything else and the parameters have to be picked up by hand.
 */

export interface TicketReturn {
  status: 'success' | 'cancelled';
  sessionId: string | null;
}

export function readTicketReturn(): TicketReturn | null {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  const ticket = params.get('ticket');

  if (ticket !== 'success' && ticket !== 'cancelled') return null;

  return {
    status: ticket,
    sessionId: params.get('session_id')
  };
}

/**
 * Strips the ticket parameters once they have been consumed, so a refresh or a
 * shared link does not replay the confirmation screen. Uses replaceState to
 * avoid adding a history entry the back button would step through.
 */
export function clearTicketParams(): void {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  url.searchParams.delete('ticket');
  url.searchParams.delete('session_id');

  window.history.replaceState({}, '', url.toString());
}
