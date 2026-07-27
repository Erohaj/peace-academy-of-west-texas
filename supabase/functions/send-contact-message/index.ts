import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { errorResponse, handleCors, jsonResponse } from '../_shared/cors.ts';
import { emailLayout, escapeHtml, sendEmail } from '../_shared/email.ts';

/**
 * Contact form endpoint.
 *
 * Runs as an Edge Function rather than a direct table insert for two reasons:
 * the Resend key must stay server-side, and `contact_messages` has no public
 * insert policy — a table the anon key can write to is an open spam target.
 */

const ORG_INBOX = Deno.env.get('CONTACT_INBOX') ?? 'paowtx@gmail.com';

/** Messages accepted from one IP per hour before further ones are rejected. */
const RATE_LIMIT_PER_HOUR = 5;

const MAX_NAME = 120;
const MAX_EMAIL = 254;
const MAX_MESSAGE = 5000;

interface ContactPayload {
  fullName?: string;
  email?: string;
  message?: string;
  website?: string;
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  let payload: ContactPayload;
  try {
    payload = await req.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  // Honeypot: the form renders this field hidden and no human fills it. Return
  // a success shape so the bot has nothing to tune against.
  if (payload.website && payload.website.trim() !== '') {
    return jsonResponse({ ok: true });
  }

  const fullName = (payload.fullName ?? '').trim();
  const email = (payload.email ?? '').trim().toLowerCase();
  const message = (payload.message ?? '').trim();

  if (!fullName || fullName.length > MAX_NAME) return errorResponse('Invalid name');
  if (!email || email.length > MAX_EMAIL || !email.includes('@')) return errorResponse('Invalid email');
  if (!message || message.length > MAX_MESSAGE) return errorResponse('Invalid message');

  // Service role bypasses RLS, which is exactly what this endpoint needs and
  // exactly why the key never leaves the function.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  // Supabase puts the caller's address here; the first entry is the client.
  const sourceIp = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null;

  if (sourceIp) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await supabase
      .from('contact_messages')
      .select('id', { count: 'exact', head: true })
      .eq('source_ip', sourceIp)
      .gte('created_at', oneHourAgo);

    if (countError) {
      // A failed rate-limit lookup should not silently disable the limit, but
      // it also should not block a legitimate visitor. Log and continue.
      console.error('[PAWTX] Rate limit check failed', countError);
    } else if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
      return errorResponse('Too many messages from this address. Please try again later.', 429);
    }
  }

  const { error: insertError } = await supabase.from('contact_messages').insert({
    full_name: fullName,
    email,
    message,
    source_ip: sourceIp
  });

  if (insertError) {
    console.error('[PAWTX] Failed to store contact message', insertError);
    return errorResponse('Could not save your message', 500);
  }

  // The message is already safely stored, so a mail failure must not surface
  // as a failed submission — the org can still read it in the admin panel.
  try {
    await sendEmail({
      to: ORG_INBOX,
      replyTo: email,
      subject: `Website contact: ${fullName}`,
      html: emailLayout(
        'New message from the website',
        `
          <p style="margin:0 0 8px;"><strong>From:</strong> ${escapeHtml(fullName)} &lt;${escapeHtml(email)}&gt;</p>
          <div style="background:#F4F1ED;border:1px solid #E5E0D8;border-radius:12px;padding:16px;white-space:pre-wrap;font-size:14px;">
${escapeHtml(message)}
          </div>
          <p style="font-size:12px;color:#5A5A5A;margin:16px 0 0;">Reply directly to this email to respond to the sender.</p>
        `
      )
    });
  } catch (mailError) {
    console.error('[PAWTX] Contact message stored but email failed', mailError);
  }

  return jsonResponse({ ok: true });
});
