import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { errorResponse, handleCors, jsonResponse } from '../_shared/cors.ts';
import { emailLayout, escapeHtml, sendEmail } from '../_shared/email.ts';
import { confirmationNumber } from '../_shared/receipt.ts';

/**
 * Sends the RSVP confirmation to the attendee and a heads-up to the org.
 *
 * Triggered by a database trigger rather than called from the browser, so a
 * visitor closing the tab immediately after submitting still gets their email.
 * Both triggers live in supabase/migrations/*_event_tickets.sql and both post
 * the payload shape the dashboard's own "Database Webhook" builder produces:
 *
 *   send_rsvp_confirmation            after insert, when the seat needs no
 *                                     payment or is already paid for
 *   send_rsvp_confirmation_on_payment after the update that marks a prepaid
 *                                     seat paid — the point at which that
 *                                     booking first becomes true
 *
 * A pending booking deliberately gets nothing. Its holder is still on Stripe's
 * page and the seat goes back if they do not pay, so "You're registered!"
 * would be a promise about a place that is about to be offered to someone else.
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
  // Present on every row since the prepaid-ticket migration. Older rows, and
  // the free bookings that are still most of them, read 'not_required'.
  payment_status: string | null;
  amount_cents: number | null;
  payment_method: string | null;
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
        footer: '¿Cambiaron tus planes? Responde a este correo y liberaremos tu lugar.',
        paidHeading: 'Comprobante de pago',
        paidAmount: 'Pagado',
        paidWaived: 'Cuota exonerada',
        paidConfirmation: 'N.º de confirmación',
        paidMethod: 'Método',
        paidMethods: { card: 'Tarjeta', cash: 'Efectivo', check: 'Cheque', waived: 'Exonerado' },
        paidNote:
          'Este es el comprobante del pago de tu entrada al evento. Como recibes ' +
          'la entrada a cambio, no se trata de un donativo deducible de impuestos.'
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
        footer: "Plans changed? Just reply to this email and we'll free up your spot.",
        paidHeading: 'Payment confirmation',
        paidAmount: 'Paid',
        paidWaived: 'Fee waived',
        paidConfirmation: 'Confirmation #',
        paidMethod: 'Method',
        paidMethods: { card: 'Card', cash: 'Cash', check: 'Check', waived: 'Waived' },
        paidNote:
          'This is the confirmation of your payment for admission to this event. ' +
          'Because you receive admission in return, it is not a tax-deductible donation.'
      };

  // The one sentence in this email that has to be exactly right: a payment for
  // a seat is not a gift. Wording it as one — or reusing the donation receipt,
  // which states that no goods or services were provided — would hand the
  // attendee a document saying something untrue about their own taxes, and the
  // organisation a contribution it never received. Hence a separate block here
  // rather than anything shared with stripe-webhook's receipt.
  const paidBlock = buildPaidBlock(rsvp, copy);

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
          ${paidBlock}
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
            <div><strong>Payment:</strong> ${escapeHtml(describePaymentForOrg(rsvp))}</div>
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

interface PaidCopy {
  paidHeading: string;
  paidAmount: string;
  paidWaived: string;
  paidConfirmation: string;
  paidMethod: string;
  paidMethods: Record<string, string>;
  paidNote: string;
}

/**
 * The receipt half of the confirmation, or nothing at all.
 *
 * Returns an empty string for every booking that was not paid for through this
 * site — free events, and the ones whose fee is settled at the door, which is
 * still how most of them work. Those attendees get the letter they always got.
 */
function buildPaidBlock(rsvp: RsvpRecord, copy: PaidCopy): string {
  if (rsvp.payment_status !== 'paid') return '';

  const method = rsvp.payment_method ?? 'card';
  const methodLabel = copy.paidMethods[method] ?? method;

  // Three cases, and conflating any two of them misstates what happened.
  //
  // A waived fee is not a payment, so it prints no amount: saying "Paid:
  // $60.00" to somebody who was waved in would be the organisation's own
  // record contradicting itself, and the attendee's if they ever had to
  // produce it.
  //
  // A booking with no `amount_cents` was never priced here — that is an event
  // whose fee is settled at the door — so it can confirm the payment and the
  // method but has no figure to quote. It must not fall through to the waived
  // branch, which would tell somebody who just handed over cash that they were
  // let in free.
  const amountLine =
    method === 'waived'
      ? `<div>${copy.paidWaived}</div>`
      : rsvp.amount_cents === null
        ? `<div><strong>${copy.paidAmount}</strong></div>
           <div>${copy.paidMethod}: ${escapeHtml(methodLabel)}</div>`
        : `<div><strong>${copy.paidAmount}: ${formatUsd(rsvp.amount_cents)}</strong></div>
           <div>${copy.paidMethod}: ${escapeHtml(methodLabel)}</div>`;

  return `
    <div style="background:#F4F1ED;border:1px solid #E5E0D8;border-radius:12px;padding:16px;font-size:13px;line-height:1.7;margin-top:12px;">
      <div style="font-weight:700;margin-bottom:8px;">${copy.paidHeading}</div>
      ${amountLine}
      <div>${copy.paidConfirmation}: ${confirmationNumber(rsvp.id)}</div>
    </div>
    <p style="font-size:12px;color:#5A5A5A;margin:12px 0 0;">
      ${copy.paidNote}
    </p>
  `;
}

/** One line for the staff copy, in English, whatever the attendee read. */
function describePaymentForOrg(rsvp: RsvpRecord): string {
  const amount = rsvp.amount_cents === null ? null : formatUsd(rsvp.amount_cents);

  switch (rsvp.payment_status) {
    case 'paid':
      return rsvp.payment_method === 'waived'
        ? 'fee waived'
        : `${amount ?? 'paid'} — ${rsvp.payment_method ?? 'card'}`;
    case 'pending':
      return `${amount ?? ''} awaiting payment`.trim();
    default:
      // 'not_required' is the overwhelming majority and the historical
      // default: a free event, or a fee this site does not collect.
      return 'nothing owed through the site';
  }
}

function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

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
