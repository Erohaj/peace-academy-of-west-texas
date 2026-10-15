import type { RsvpPaymentStatus } from '../../types';
import { getSiteUrl, requireSupabase } from '../supabaseClient';

export interface TicketCheckoutInput {
  eventId: string;
  fullName: string;
  email: string;
  phone?: string;
  guestCount: number;
  mediaConsent?: string | null;
  language: 'en' | 'es';
}

/**
 * What the thank-you screen is allowed to know about a booking.
 *
 * Deliberately narrower than the `rsvps` row: `ticket-status` withholds the
 * email and phone, because a session id that ends up in a shared link or a
 * server log must not be a way to read somebody's contact details back out.
 */
export interface TicketStatus {
  id: string;
  event_id: string;
  full_name: string;
  guest_count: number;
  amount_cents: number | null;
  payment_status: RsvpPaymentStatus;
  paid_at: string | null;
  created_at: string;
  confirmation_number: string;
}

/**
 * An outcome the visitor can reach by filling the form in honestly: the event
 * filled up while they typed, this address already holds a seat, the event
 * ended. `create-ticket-session` returns these with a 200 and a `code`, so the
 * form can tell them apart without digging a body out of a thrown error — see
 * the comment on BOOKING_ERRORS in that function.
 */
export class TicketBookingError extends Error {
  /** The SQLSTATE create_rsvp raised, so `toActionError` can map it. */
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'TicketBookingError';
    this.code = code;
  }
}

/**
 * Books a seat at a prepaid event and returns the Stripe Checkout URL to send
 * the browser to.
 *
 * One call does both halves — the booking and the payment session — because
 * the seat is held from the moment the booking exists, and a hold with no
 * session attached is a seat nobody can pay for. See
 * `supabase/functions/create-ticket-session`.
 *
 * Card details are never touched by this application; the browser is
 * redirected to Stripe's own page. Neither is the price sent from here: the
 * Edge Function reads `events.fee` and charges that. Anything a client sends
 * about money is a request, not an instruction.
 */
export async function createTicketSession(input: TicketCheckoutInput): Promise<string> {
  const { data, error } = await requireSupabase().functions.invoke<{
    url?: string;
    error?: string;
    code?: string;
  }>('create-ticket-session', {
    body: {
      eventId: input.eventId,
      fullName: input.fullName,
      email: input.email,
      phone: input.phone ?? '',
      guestCount: input.guestCount,
      mediaConsent: input.mediaConsent ?? null,
      language: input.language,
      // The return address is derived from the running bundle rather than
      // assumed to be the origin root, and the Edge Function only honours it
      // when it matches an allowed origin.
      returnUrl: getSiteUrl()
    }
  });

  if (error) throw error;

  if (data?.error) {
    throw new TicketBookingError(data.code ?? '', data.error);
  }

  if (!data?.url) throw new Error('Ticket checkout did not return a URL');

  return data.url;
}

/**
 * Looks up a booking after Stripe redirects back, so the confirmation screen
 * can show a seat read from the database instead of trusting the query string.
 *
 * Returns null while the webhook has not landed yet — Stripe redirects the
 * browser and calls the webhook independently, and the redirect usually wins
 * the race by a second or two. A row that reads `pending` is the same
 * situation one step later. The screen polls rather than claiming either
 * outcome.
 */
export async function fetchTicketBySession(sessionId: string): Promise<TicketStatus | null> {
  const { data, error } = await requireSupabase().functions.invoke<TicketStatus | null>(
    'ticket-status',
    { body: { sessionId } }
  );

  if (error) throw error;
  return data ?? null;
}
