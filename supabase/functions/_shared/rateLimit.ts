/**
 * Per-IP rate limiting for the unauthenticated endpoints that cost something
 * to call.
 *
 * send-contact-message counts rows in `contact_messages`, which works because
 * every call to it is meant to leave a row there. The payment endpoints are
 * not like that: `create-ticket-session` takes a *hold* on seats before any
 * money exists, so somebody looping it with fresh email addresses can park an
 * entire event's capacity behind holds that have not been paid for. The seats
 * come back when the holds lapse, but in the meantime a real attendee is told
 * the event is full.
 *
 * Counting lives in its own table rather than in `rsvps` so that bookings
 * never grow an IP column. An address next to a name, an email and a phone
 * number is a meaningfully different kind of record to hold about the people
 * who come to a community event, and this table keeps nothing but the counter
 * it needs, for a day.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

/**
 * The caller's address as Supabase reports it. The first entry of
 * x-forwarded-for is the client; the rest are proxies, and a client can prepend
 * whatever it likes — which is why this is a speed bump on casual abuse, not an
 * identity. Anyone with a pool of addresses is unaffected by it.
 */
export function callerIp(req: Request): string | null {
  const first = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
  return first ? first.slice(0, 64) : null;
}

/**
 * Records a hit and reports whether the caller is still under the limit.
 *
 * Counting and recording happen in one SECURITY DEFINER function so two
 * simultaneous requests cannot both read the old count and both be allowed.
 *
 * Fails open, deliberately and for the same reason send-contact-message does:
 * a broken limiter must not become an outage for people trying to pay for a
 * seat. It is logged loudly instead.
 */
export async function withinRateLimit(
  supabase: SupabaseClient,
  bucket: string,
  sourceIp: string | null,
  windowSeconds: number,
  limit: number
): Promise<boolean> {
  // No attributable address means no counting. Blocking here would turn an
  // unexpected proxy configuration into a site that cannot take payments.
  if (!sourceIp) return true;

  const { data, error } = await supabase.rpc('record_rate_limit_hit', {
    p_bucket: bucket,
    p_source_ip: sourceIp,
    p_window_seconds: windowSeconds,
    p_limit: limit
  });

  if (error) {
    console.error('[PAWTX] Rate limit check failed', error);
    return true;
  }

  return data !== false;
}
