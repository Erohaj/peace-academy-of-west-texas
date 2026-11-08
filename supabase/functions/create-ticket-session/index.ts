import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { errorResponse, handleCors, jsonResponse } from '../_shared/cors.ts';
import { confirmationNumber } from '../_shared/receipt.ts';
import { callerIp, withinRateLimit } from '../_shared/rateLimit.ts';

/**
 * Books a seat at a prepaid event and hands back the Stripe Checkout URL.
 *
 * One call does both halves, on purpose. The alternative — the browser calls
 * `create_rsvp` itself and then asks for a payment URL — leaves a window in
 * which a seat is held by a booking that will never have a Stripe session
 * attached, because the second call never came. Here the hold and the session
 * are created together and the hold is given straight back if the session
 * cannot be.
 *
 * The amount is never taken from the request. It comes from `events.fee` by
 * way of the `rsvps` row that `create_rsvp` just wrote, which is the only
 * figure either side can be held to. A price in the body would be a price the
 * browser could edit.
 *
 * The seat is held for about half an hour (`hold_expires_at`); Stripe's own
 * session is set to expire two minutes before that, so a payment can never
 * arrive for a seat that has already gone back into the pool. `stripe-webhook`
 * is the only writer that marks the booking paid.
 */

interface TicketPayload {
  eventId?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  guestCount?: number;
  mediaConsent?: string | null;
  language?: string;
  returnUrl?: string;
}

/**
 * The outcomes a visitor can reach by filling the form in honestly — the event
 * filled up while they typed, this address already holds a seat, the event
 * ended — are answers, not transport failures, and they come back with a 200
 * and a body saying which.
 *
 * `supabase.functions.invoke` surfaces a non-2xx as an exception whose body has
 * to be dug out of `error.context`, and the shape of that has moved between
 * client versions. Since the RSVP form has to tell "full" apart from "already
 * registered" apart from "try again later" — three different things for the
 * visitor to do next — the distinction travels in the body, where reading it
 * does not depend on the client's error plumbing. Genuine faults (bad JSON, no
 * Stripe key, Stripe unreachable) still return real error statuses, because
 * there is nothing for the visitor to decide about those.
 *
 * The SQLSTATE travels alongside so the browser can run it through the same
 * `src/lib/api/errors.ts` table every other RSVP failure goes through, rather
 * than a second copy of the mapping that would drift from the first.
 */
const BOOKING_ERRORS: Record<string, string> = {
  PA001: 'event_full',
  PA002: 'already_registered',
  PA003: 'event_not_found',
  PA004: 'invalid_guest_count',
  PA005: 'media_consent_required',
  PA006: 'event_over',
  PA007: 'payment_unavailable'
};

/**
 * Seat holds one address may start per hour.
 *
 * Generous for a person — a declined card, a back button and a second attempt
 * all land well inside it — and small enough that a loop cannot park a whole
 * event's capacity behind unpaid holds. It is a speed bump, not a defence:
 * x-forwarded-for is client-supplied and anyone with a pool of addresses walks
 * straight past it. What it buys is that casual abuse costs more than a for
 * loop, and that the org notices in the logs before the room is "full".
 */
const HOLDS_PER_HOUR = 6;
const RATE_WINDOW_SECONDS = 3600;

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) {
    console.error('[PAWTX] STRIPE_SECRET_KEY is not set');
    return errorResponse('Payments are not configured', 500);
  }

  let payload: TicketPayload;
  try {
    payload = await req.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const eventId = String(payload.eventId ?? '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return errorResponse('Invalid event id');

  const fullName = String(payload.fullName ?? '').trim().slice(0, 120);
  const email = String(payload.email ?? '').trim().toLowerCase();
  const phone = String(payload.phone ?? '').trim().slice(0, 40);
  const guestCount = Number(payload.guestCount ?? 0);
  const language = payload.language === 'es' ? 'es' : 'en';

  if (!fullName) return errorResponse('A name is required');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return errorResponse('A valid email is required');
  if (!Number.isInteger(guestCount) || guestCount < 0 || guestCount > 10) {
    return errorResponse('Invalid guest count');
  }

  const configuredSite = Deno.env.get('SITE_URL') ?? '';
  const returnUrl = pickReturnUrl(payload.returnUrl, configuredSite);
  if (!returnUrl) return errorResponse('Return URL is not allowed');

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-12-18.acacia' });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  // Checked before the event is even looked up, because the expensive thing
  // here is not the query — it is create_rsvp taking seats off the event a few
  // lines down.
  const allowed = await withinRateLimit(
    supabase,
    'ticket_session',
    callerIp(req),
    RATE_WINDOW_SECONDS,
    HOLDS_PER_HOUR
  );

  if (!allowed) {
    return errorResponse('Too many booking attempts from this address. Please try again later.', 429);
  }

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, title, title_es, location, starts_at, fee, payment_required, published')
    .eq('id', eventId)
    .maybeSingle();

  if (eventError) {
    console.error('[PAWTX] Could not load the event for a ticket', eventError);
    return errorResponse('Lookup failed', 500);
  }

  if (!event || !event.published) {
    return jsonResponse({ error: 'event_not_found', code: 'PA003' });
  }

  // This endpoint exists only for events that must be paid for up front. A
  // free one — or one whose fee is settled at the door — goes through
  // `create_rsvp` from the browser like it always has, and sending it here
  // instead would charge for a seat the organisation gives away.
  if (!event.payment_required) {
    return jsonResponse({ error: 'payment_not_required', code: 'PA007' });
  }

  // Somebody coming back to pay for a booking they started. The one-row-per-
  // email index would refuse the new booking, which to them looks like being
  // told they are already registered for an event they have not paid for. The
  // old hold goes back, and its Stripe session is expired first: releasing the
  // seat while a live session could still charge for it is the one ordering
  // that could take money for a place already given away.
  const { data: priorHold } = await supabase
    .from('rsvps')
    .select('id, stripe_session_id')
    .eq('event_id', eventId)
    .eq('email', email)
    .eq('payment_status', 'pending')
    .maybeSingle();

  if (priorHold) {
    if (priorHold.stripe_session_id) {
      try {
        await stripe.checkout.sessions.expire(priorHold.stripe_session_id);
      } catch (expireError) {
        // Already expired or already paid. Expired is the common case and
        // fine; paid means the webhook is about to confirm that booking, and
        // `release_rsvp_hold` only touches a row that is still pending, so it
        // will leave the paid one alone.
        console.warn('[PAWTX] Could not expire the previous ticket session', expireError);
      }
    }

    await supabase.rpc('release_rsvp_hold', { p_rsvp_id: priorHold.id });
  }

  const { data: rsvp, error: rsvpError } = await supabase.rpc('create_rsvp', {
    p_event_id: eventId,
    p_full_name: fullName,
    p_email: email,
    p_phone: phone || null,
    p_guest_count: guestCount,
    p_optional_donation: 0,
    p_media_consent: payload.mediaConsent ?? null,
    p_language: language
  });

  if (rsvpError) {
    const known = BOOKING_ERRORS[rsvpError.code ?? ''];
    if (known) return jsonResponse({ error: known, code: rsvpError.code });

    console.error('[PAWTX] Ticket booking failed', rsvpError);
    return errorResponse('Could not book that seat', 500);
  }

  // `create_rsvp` re-reads the event under its own lock and decides for itself
  // whether this booking must be paid for. If it came back unpriced, the event
  // stopped being prepaid between the read above and that lock — an admin
  // turning the toggle off mid-form. The seat is booked and free, which is a
  // coherent outcome and the one the organisation just asked for; there is
  // simply nothing to charge. Said plainly here rather than left to the price
  // check below, which would log an arithmetic disagreement for what is a race.
  if (rsvp.payment_status !== 'pending') {
    console.warn(
      '[PAWTX] Event %s stopped requiring payment mid-booking; rsvp %s stands as %s',
      eventId,
      rsvp.id,
      rsvp.payment_status
    );
    return jsonResponse({ error: 'payment_not_required', code: 'PA007' });
  }

  const seats = guestCount + 1;
  const unitAmount = Math.round(Number(event.fee) * 100);

  // The row is what the organisation will be held to, so Stripe must be asked
  // for exactly it. These two can only disagree if the fee changed between
  // `create_rsvp` reading it and this line, or if the arithmetic in one of the
  // two places is wrong — either way, charging the difference is not an option.
  if (unitAmount * seats !== rsvp.amount_cents) {
    console.error(
      '[PAWTX] Ticket price disagreement: event fee implies %d, the booking says %d',
      unitAmount * seats,
      rsvp.amount_cents
    );
    await supabase.rpc('release_rsvp_hold', { p_rsvp_id: rsvp.id });
    return errorResponse('Could not price that seat', 500);
  }

  const isEs = language === 'es';
  const eventTitle = (isEs && event.title_es?.trim()) || event.title;
  const metadata = {
    kind: 'event_ticket',
    rsvp_id: rsvp.id,
    event_id: eventId,
    seats: String(seats),
    confirmation_number: confirmationNumber(rsvp.id)
  };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: unitAmount,
            product_data: {
              name: eventTitle,
              // Stripe's page is the last thing they see before paying, so it
              // repeats what they are buying a seat at rather than only a
              // price. The date is formatted in the venue's timezone for the
              // same reason every other date in this project is.
              description: `${formatEventDay(event.starts_at, isEs)} · ${event.location}`
            }
          },
          quantity: seats
        }
      ],
      // Read back by the webhook to find the booking this payment belongs to.
      metadata,
      // Session metadata stops at the session: Stripe does not copy it onto
      // the PaymentIntent, and the Dashboard's payment search reads the
      // PaymentIntent's. Attaching it to the object that holds the money is
      // what makes an attendee's confirmation number findable by whoever is
      // reconciling the bank statement.
      payment_intent_data: { metadata },
      // Two minutes inside the seat's own deadline, so Stripe stops accepting
      // payment before the seat goes back to the pool. Stripe refuses anything
      // under 30 minutes out, which is why `create_rsvp` holds for 35.
      expires_at: Math.floor(new Date(rsvp.hold_expires_at).getTime() / 1000) - 120,
      success_url: `${returnUrl}?ticket=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnUrl}?ticket=cancelled`
    });

    const { error: attachError } = await supabase
      .from('rsvps')
      .update({ stripe_session_id: session.id })
      .eq('id', rsvp.id);

    if (attachError) {
      // Without the session id on the row the webhook can still find it by
      // `rsvp_id` in the metadata, but the thank-you screen cannot look it up
      // at all — and the retry path above has nothing to expire. Give the seat
      // back rather than sell a ticket nobody can be shown.
      console.error('[PAWTX] Could not attach the Stripe session to the booking', attachError);
      try {
        await stripe.checkout.sessions.expire(session.id);
      } catch (expireError) {
        console.error('[PAWTX] Could not expire the orphaned session', expireError);
      }
      await supabase.rpc('release_rsvp_hold', { p_rsvp_id: rsvp.id });
      return errorResponse('Could not start the payment', 500);
    }

    return jsonResponse({ url: session.url, confirmationNumber: metadata.confirmation_number });
  } catch (error) {
    console.error('[PAWTX] Ticket checkout session creation failed', error);
    // The seat is held by a booking that now has no way to be paid for. It
    // would come back on its own in half an hour; returning it now is the
    // difference between a visitor retrying immediately and one being told the
    // event is full by their own abandoned attempt.
    await supabase.rpc('release_rsvp_hold', { p_rsvp_id: rsvp.id });
    return errorResponse('Could not start the payment', 502);
  }
});

/** The event's day, in the venue's timezone — see src/lib/formatEventDate.ts. */
function formatEventDay(startsAt: string, isEs: boolean): string {
  return new Intl.DateTimeFormat(isEs ? 'es-US' : 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Chicago'
  }).format(new Date(startsAt));
}

/**
 * Accepts the client's return URL only when it lives on an allowed origin, so
 * a crafted request cannot turn a PAWTX Checkout page into a redirect to
 * somewhere else after payment. Same rule, and the same SITE_URL list, as
 * create-checkout-session — the first entry is the trusted fallback.
 */
function pickReturnUrl(candidate: string | undefined, configuredSite: string): string | null {
  const allowed = configuredSite
    .split(',')
    .map((entry) => entry.trim().replace(/\/$/, ''))
    .filter(Boolean);

  if (allowed.length === 0) {
    console.error('[PAWTX] SITE_URL is not set');
    return null;
  }

  const fallback = allowed[0];
  if (!candidate) return fallback;

  try {
    const candidateOrigin = new URL(candidate).origin;
    const isAllowed = allowed.some((entry) => {
      try {
        return new URL(entry).origin === candidateOrigin;
      } catch {
        return false;
      }
    });

    return isAllowed ? candidate.replace(/\/$/, '') : fallback;
  } catch {
    return fallback;
  }
}
