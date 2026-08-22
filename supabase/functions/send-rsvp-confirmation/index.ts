import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { errorResponse, handleCors, jsonResponse } from '../_shared/cors.ts';
import { emailLayout, escapeHtml, sendEmail } from '../_shared/email.ts';

/**
 * Sends the RSVP confirmation to the attendee and a heads-up to the org.
 *
 * Triggered by a Database Webhook rather than called from the browser, so a
 * visitor closing the tab immediately after submitting still gets their email.
 * Configure it in the dashboard:
 *
 *   Database → Webhooks → Create
 *     Table:  rsvps
 *     Events: INSERT
 *     Type:   Supabase Edge Functions → send-rsvp-confirmation
 *
 * The webhook posts with the project's service role key in the Authorization
 * header, which satisfies the default JWT check — deploy this one normally
 * (no --no-verify-jwt).
 */

const ORG_INBOX = Deno.env.get('CONTACT_INBOX') ?? 'paowtx@gmail.com';
const EVENT_TIME_ZONE = 'America/Chicago';

interface RsvpRecord {
  id: string;
  event_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  guest_count: number;
  language: 'en' | 'es' | null;
}

interface WebhookPayload {
  type?: string;
  table?: string;
  record?: RsvpRecord;
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const rsvp = payload.record;
  if (!rsvp?.email || !rsvp.event_id) return errorResponse('Missing RSVP record');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  const { data: event, error } = await supabase
    .from('events')
    .select('title, title_es, starts_at, ends_at, location')
    .eq('id', rsvp.event_id)
    .maybeSingle();

  if (error || !event) {
    console.error('[PAWTX] Could not load event for RSVP confirmation', error);
    return errorResponse('Event not found', 404);
  }

  // Rows written before the language column existed carry null, and those
  // attendees did read the English site.
  const isEs = rsvp.language === 'es';
  const locale = isEs ? 'es-US' : 'en-US';

  // title_es is NOT NULL in the schema, but an empty string would still leave
  // a Spanish reader looking at a blank subject line.
  const eventTitle = (isEs && event.title_es?.trim()) || event.title;

  const start = new Date(event.starts_at);
  const dayLabel = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: EVENT_TIME_ZONE
  }).format(start);

  const timeLabel = new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: EVENT_TIME_ZONE
  }).format(start);

  const calendarUrl = buildGoogleCalendarUrl(
    eventTitle,
    event.location,
    start,
    event.ends_at ? new Date(event.ends_at) : null
  );

  const partySize = rsvp.guest_count + 1;

  const copy = isEs
    ? {
        subject: `Te has registrado: ${eventTitle}`,
        heading: '¡Te has registrado!',
        intro: `Gracias, ${escapeHtml(rsvp.full_name)} — hemos reservado ${
          partySize === 1 ? 'tu lugar' : `${partySize} lugares`
        } en este evento.`,
        at: 'a las',
        registeredUnder: 'Registrado a nombre de',
        calendar: 'Añadir a Google Calendar',
        footer: '¿Cambiaron tus planes? Responde a este correo y liberaremos tu lugar.'
      }
    : {
        subject: `You're registered: ${eventTitle}`,
        heading: "You're registered!",
        intro: `Thanks, ${escapeHtml(rsvp.full_name)} — we've saved ${
          partySize === 1 ? 'your spot' : `${partySize} spots`
        } at this event.`,
        at: 'at',
        registeredUnder: 'Registered under',
        calendar: 'Add to Google Calendar',
        footer: "Plans changed? Just reply to this email and we'll free up your spot."
      };

  try {
    await sendEmail({
      to: rsvp.email,
      replyTo: ORG_INBOX,
      subject: copy.subject,
      html: emailLayout(
        copy.heading,
        `
          <p style="font-size:14px;line-height:1.6;margin:0 0 20px;">
            ${copy.intro}
          </p>
          <div style="background:#F4F1ED;border:1px solid #E5E0D8;border-radius:12px;padding:16px;font-size:13px;line-height:1.7;">
            <div style="font-weight:700;font-size:15px;margin-bottom:6px;">${escapeHtml(eventTitle)}</div>
            <div>${escapeHtml(dayLabel)} ${copy.at} ${escapeHtml(timeLabel)}</div>
            <div>${escapeHtml(event.location)}</div>
            <div style="margin-top:8px;">${copy.registeredUnder}: ${escapeHtml(rsvp.email)}</div>
          </div>
          <p style="margin:24px 0 0;">
            <a href="${calendarUrl}" style="display:inline-block;background:#A64D32;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:999px;font-size:13px;font-weight:700;">
              ${copy.calendar}
            </a>
          </p>
          <p style="font-size:12px;color:#5A5A5A;margin:20px 0 0;">
            ${copy.footer}
          </p>
        `
      )
    });
  } catch (mailError) {
    // The RSVP itself is already committed. Report the failure so Supabase
    // retries the webhook, but never let it look like the booking failed.
    console.error('[PAWTX] RSVP confirmation email failed', mailError);
    return errorResponse('Email failed', 500);
  }

  try {
    await sendEmail({
      to: ORG_INBOX,
      replyTo: rsvp.email,
      subject: `New RSVP: ${event.title} (+${rsvp.guest_count})`,
      html: emailLayout(
        'New RSVP',
        `
          <div style="font-size:14px;line-height:1.7;">
            <div><strong>Event:</strong> ${escapeHtml(event.title)}</div>
            <div><strong>Name:</strong> ${escapeHtml(rsvp.full_name)}</div>
            <div><strong>Email:</strong> ${escapeHtml(rsvp.email)}</div>
            <div><strong>Phone:</strong> ${escapeHtml(rsvp.phone ?? '—')}</div>
            <div><strong>Party size:</strong> ${partySize}</div>
            <div><strong>Language:</strong> ${isEs ? 'Spanish' : 'English'}</div>
          </div>
        `
      )
    });
  } catch (mailError) {
    // The attendee already has their confirmation; the org copy is a courtesy
    // and the RSVP is visible in the admin panel regardless.
    console.error('[PAWTX] Org RSVP notification failed', mailError);
  }

  return jsonResponse({ ok: true });
});

/** Google Calendar wants local wall-clock stamps plus an explicit timezone. */
function buildGoogleCalendarUrl(
  title: string,
  location: string,
  start: Date,
  end: Date | null
): string {
  const stamp = (date: Date) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: EVENT_TIME_ZONE
    }).formatToParts(date);

    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
    const hour = get('hour') === '24' ? '00' : get('hour');
    return `${get('year')}${get('month')}${get('day')}T${hour}${get('minute')}${get('second')}`;
  };

  const finish = end ?? new Date(start.getTime() + 2 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    location,
    dates: `${stamp(start)}/${stamp(finish)}`,
    ctz: EVENT_TIME_ZONE
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
