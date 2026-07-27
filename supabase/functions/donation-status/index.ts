import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { errorResponse, handleCors, jsonResponse } from '../_shared/cors.ts';

/**
 * Looks up one donation by its Stripe Checkout Session id, so the thank-you
 * screen can display a confirmed amount instead of trusting the query string.
 *
 * `donations` is readable only by admins under RLS — donor names, emails and
 * amounts are not public. This endpoint is the narrow exception: it returns a
 * single row, only to a caller who already holds that session id (Stripe just
 * put it in their address bar), and only the fields the receipt screen needs.
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

  // Stripe session ids look like cs_test_a1B2... — reject anything else rather
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
    .from('donations')
    .select('id, amount_cents, currency, frequency, donor_name, status, created_at')
    .eq('stripe_session_id', sessionId)
    .maybeSingle();

  if (error) {
    console.error('[PAWTX] Donation lookup failed', error);
    return errorResponse('Lookup failed', 500);
  }

  // Null is a normal answer, not an error: the browser redirect from Stripe
  // usually beats the webhook by a second or two, so the row may still be
  // pending. The client polls.
  return jsonResponse(data ?? null);
});
