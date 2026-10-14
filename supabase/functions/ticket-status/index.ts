import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { errorResponse, handleCors, jsonResponse } from '../_shared/cors.ts';
import { confirmationNumber } from '../_shared/receipt.ts';

/**
 * Looks up one prepaid booking by its Stripe Checkout Session id, so the
 * screen an attendee lands on after paying can show a confirmed seat read back
 * from the database instead of trusting the query string.
 *
 * `rsvps` is readable only by admins under RLS — attendee names, emails and
 * phone numbers are not public. This endpoint is the narrow exception, on the
 * same terms as `donation-status`: one row, only to a caller who already holds
 * that session id because Stripe just put it in their address bar, and only
 * the fields the confirmation screen renders. The email and phone are left
 * out; a session id in a shared or logged URL must not become a way to read
 * somebody's contact details back out of the table.
 */

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  let sessionId: string;
  try {
    const body = await req.json();
    sessionId = String(body.sessionId ?? '').trim();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  // Stripe session ids look like cs_test_a1B2… — reject anything else rather
  // than letting arbitrary strings probe the table.
  if (!/^cs_[A-Za-z0-9_]{10,200}$/.test(sessionId)) {
    return errorResponse('Invalid session id');
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .from('rsvps')
    .select('id, event_id, full_name, guest_count, amount_cents, payment_status, paid_at, created_at')
    .eq('stripe_session_id', sessionId)
    .maybeSingle();

  if (error) {
    console.error('[PAWTX] Ticket lookup failed', error);
    return errorResponse('Lookup failed', 500);
  }

  // Null is a normal answer, not an error: Stripe redirects the browser and
  // calls the webhook independently, and the redirect usually wins the race by
  // a second or two — so the booking may still read `pending`. The client
  // polls, and the screen says the payment is going through rather than
  // claiming either outcome.
  if (!data) return jsonResponse(null);

  return jsonResponse({
    ...data,
    // Derived here so the browser never has to reproduce the rule, and so the
    // number an attendee quotes is the same one the receipt and Stripe's
    // metadata carry.
    confirmation_number: confirmationNumber(data.id)
  });
});
