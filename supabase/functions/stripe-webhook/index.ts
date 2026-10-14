import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { emailLayout, escapeHtml, sendEmail } from '../_shared/email.ts';
import { confirmationNumber } from '../_shared/receipt.ts';

/**
 * Stripe webhook — the only writer that marks a donation or a ticket as paid.
 *
 * Two kinds of payment arrive here and they are told apart by the session's
 * `kind` metadata, written by whichever function created it: donations have no
 * `kind` (they predate tickets), a prepaid event seat has
 * `kind: 'event_ticket'` and the booking's id. They are kept in separate
 * tables on purpose — a ticket buys admission, which is the "goods or
 * services" that makes a payment non-deductible, so it must never reach a
 * receipt stating that nothing was given in return.
 *
 * Deploy WITHOUT JWT verification, because Stripe signs its requests with its
 * own scheme and sends no Supabase token:
 *
 *   supabase functions deploy stripe-webhook --no-verify-jwt
 *
 * The signature check below is what authenticates the caller, so
 * STRIPE_WEBHOOK_SECRET must be set. Without it anyone could POST a fake
 * "payment succeeded" event.
 */

const ORG_EIN = Deno.env.get('ORG_EIN') ?? '';
const ORG_INBOX = Deno.env.get('CONTACT_INBOX') ?? 'paowtx@gmail.com';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

  if (!stripeKey || !webhookSecret) {
    console.error('[PAWTX] Stripe webhook is missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET');
    return new Response('Not configured', { status: 500 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('Missing signature', { status: 400 });

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-12-18.acacia' });

  // The raw body is required: any re-serialisation invalidates the signature.
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    // Deno has no synchronous crypto here, so the async variant is required.
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error('[PAWTX] Webhook signature verification failed', error);
    return new Response('Invalid signature', { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.metadata?.kind === 'event_ticket') {
          await confirmTicket(supabase, session);
          break;
        }

        // A subscription's first payment also arrives as invoice.paid; the
        // session row is the one carrying our pending record, so update it
        // here and let invoice.paid handle renewals only.
        const { data: donation } = await supabase
          .from('donations')
          .update({
            status: session.payment_status === 'paid' ? 'paid' : 'pending',
            stripe_payment_intent:
              typeof session.payment_intent === 'string' ? session.payment_intent : null,
            stripe_subscription:
              typeof session.subscription === 'string' ? session.subscription : null,
            donor_email: session.customer_details?.email ?? null,
            donor_name:
              session.metadata?.donor_name || session.customer_details?.name || null
          })
          .eq('stripe_session_id', session.id)
          .select()
          .maybeSingle();

        if (donation && donation.status === 'paid' && !donation.receipt_sent_at) {
          await sendReceipt(supabase, donation);
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId =
          typeof invoice.subscription === 'string' ? invoice.subscription : null;

        // Renewals of a monthly gift: the original session row already exists,
        // so record each subsequent charge as its own donation -- and therefore
        // its own confirmation number, which is what a donor querying one
        // month's charge out of twelve needs. The id is left to the table
        // default here, so unlike a checkout the number is not written back to
        // Stripe; the subscription still carries the first donation's metadata,
        // which is the thread back to the series.
        if (subscriptionId && invoice.billing_reason === 'subscription_cycle') {
          const { data: renewal } = await supabase
            .from('donations')
            .insert({
              stripe_subscription: subscriptionId,
              stripe_payment_intent:
                typeof invoice.payment_intent === 'string' ? invoice.payment_intent : null,
              amount_cents: invoice.amount_paid,
              currency: invoice.currency,
              frequency: 'monthly',
              donor_email: invoice.customer_email,
              donor_name: invoice.customer_name,
              status: 'paid'
            })
            .select()
            .maybeSingle();

          if (renewal) await sendReceipt(supabase, renewal);
        }
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;

        // A seat is the thing at stake here, not just a row: the visitor did
        // not pay, so the places they were holding have to go back before
        // anyone else is turned away from them. `release_rsvp_hold` only
        // touches a booking that is still pending, which is what makes a
        // duplicate delivery — or a race with the lazy sweep inside
        // `create_rsvp` — release the same seats only once.
        if (session.metadata?.kind === 'event_ticket') {
          const rsvpId = session.metadata.rsvp_id;
          if (!rsvpId) {
            console.error('[PAWTX] Expired ticket session carries no rsvp_id', session.id);
            break;
          }

          const { error } = await supabase.rpc('release_rsvp_hold', { p_rsvp_id: rsvpId });
          if (error) throw error;
          break;
        }

        await supabase
          .from('donations')
          .update({ status: 'failed' })
          .eq('stripe_session_id', session.id)
          .eq('status', 'pending');
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        if (typeof charge.payment_intent === 'string') {
          await supabase
            .from('donations')
            .update({ status: 'refunded' })
            .eq('stripe_payment_intent', charge.payment_intent);

          // The charge could equally have been a ticket, and the event carries
          // nothing to say which — `charge.refunded` has no metadata of our
          // own on it, only the payment intent. So both are tried; each is a
          // no-op when the money was the other kind. A refunded seat is also
          // released, because a refund is how this organisation records that
          // somebody is not coming.
          const { error } = await supabase.rpc('mark_rsvp_refunded', {
            p_payment_intent: charge.payment_intent
          });
          if (error) throw error;
        }
        break;
      }

      default:
        // Stripe sends far more event types than this app cares about.
        break;
    }
  } catch (error) {
    // Returning 500 makes Stripe retry, which is what we want for a transient
    // database or mail failure.
    console.error(`[PAWTX] Failed to process ${event.type}`, error);
    return new Response('Processing failed', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
});

/**
 * Confirms a prepaid seat once Stripe says the money is in.
 *
 * No email is sent from here. The booking's own database trigger fires on the
 * update to `paid` and posts to `send-rsvp-confirmation`, which already knows
 * how to write that letter in the attendee's language — the same path a free
 * RSVP takes. Sending it here as well would be the second copy of the
 * bilingual templates, and the one that goes out of date.
 */
async function confirmTicket(
  supabase: ReturnType<typeof createClient>,
  session: Stripe.Checkout.Session
): Promise<void> {
  const rsvpId = session.metadata?.rsvp_id;
  if (!rsvpId) {
    console.error('[PAWTX] Ticket session carries no rsvp_id', session.id);
    return;
  }

  // Everything except `paid` here means Stripe has accepted the session but
  // not the money — a bank debit still clearing, for instance. Leaving the
  // booking pending is correct: it keeps its seat until the hold lapses, and
  // the later `checkout.session.async_payment_succeeded` would be the event to
  // act on. Nothing on this site offers such a method today, so this is a
  // guard rather than a path, and it says so in the log if it is ever taken.
  if (session.payment_status !== 'paid') {
    console.warn(
      '[PAWTX] Ticket session %s completed with payment_status=%s; leaving the booking pending',
      session.id,
      session.payment_status
    );
    return;
  }

  const { error } = await supabase.rpc('mark_rsvp_paid', {
    p_rsvp_id: rsvpId,
    p_payment_intent:
      typeof session.payment_intent === 'string' ? session.payment_intent : null,
    p_method: 'card'
  });

  // Thrown rather than logged: the caller turns it into a 500, which is what
  // makes Stripe deliver this event again. A seat that was paid for and not
  // confirmed is the one failure in this file that must never be quietly
  // swallowed — the attendee has been charged.
  if (error) throw error;
}

interface DonationRecord {
  id: string;
  amount_cents: number;
  frequency: string;
  donor_name: string | null;
  donor_email: string | null;
  created_at: string;
}

async function sendReceipt(
  supabase: ReturnType<typeof createClient>,
  donation: DonationRecord
): Promise<void> {
  if (!donation.donor_email) return;

  const amount = (donation.amount_cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD'
  });

  const recurring = donation.frequency === 'monthly';

  // A tax receipt must carry the organization's real EIN. Rather than print a
  // placeholder that looks official but is not, omit the line and tell the
  // donor a formal receipt follows — and flag it in the logs so it gets fixed.
  if (!ORG_EIN) {
    console.error('[PAWTX] ORG_EIN is not set — receipt sent without a tax ID line');
  }

  // The quid pro quo sentence leads unconditionally. Whether the donor
  // received anything in return has nothing to do with whether ORG_EIN happens
  // to be configured, and for a gift of $250 or more it is the sentence the
  // IRS looks for in a written acknowledgment (Pub. 1771). This was once tied
  // to the EIN, which meant the donors who most needed it were the ones who
  // did not get it. Only the second half — whether this letter is the keeper
  // or a better one is coming — turns on the EIN.
  const closingNote =
    'No goods or services were provided in exchange for this contribution. ' +
    (ORG_EIN
      ? 'Keep this receipt for your tax records.'
      : 'A formal receipt for your tax records will follow by email from our team.');

  const sent = await sendEmail({
    to: donation.donor_email,
    replyTo: ORG_INBOX,
    subject: recurring
      ? `Your monthly gift of ${amount} to Peace Academy`
      : `Your donation receipt — ${amount}`,
    html: emailLayout(
      'Thank you for your generosity',
      `
        <p style="font-size:14px;line-height:1.6;margin:0 0 20px;">
          ${escapeHtml(donation.donor_name || 'Friend')}, your ${recurring ? 'monthly ' : ''}gift of
          <strong>${amount}</strong> supports community workshops, cultural outreach and
          emergency relief across Midland &amp; Odessa.
        </p>
        <div style="background:#F4F1ED;border:1px solid #E5E0D8;border-radius:12px;padding:16px;font-size:13px;">
          <div style="font-weight:700;margin-bottom:8px;">${
            // Calling this "Official" while the note below promises a formal
            // receipt to come contradicts itself, and the thing that makes a
            // receipt official — the EIN — is exactly what is missing. Say
            // what it is until it can say the other.
            ORG_EIN ? 'Official Donation Receipt' : 'Donation Summary'
          }</div>
          <div>Confirmation #: ${confirmationNumber(donation.id)}</div>
          <div>Donor: ${escapeHtml(donation.donor_name || 'Anonymous')}</div>
          <div>Amount: ${amount}${recurring ? ' per month' : ''}</div>
          <div>Date: ${new Date(donation.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}</div>
          <div>Organization: Peace Academy of West Texas, 501(c)(3)</div>
          ${ORG_EIN ? `<div>Tax ID (EIN): ${escapeHtml(ORG_EIN)}</div>` : ''}
        </div>
        <p style="font-size:12px;color:#5A5A5A;margin:16px 0 0;">
          ${closingNote}
        </p>
      `
    )
  });

  // `receipt_sent_at` is an assertion about a donor's tax paperwork, so stamp
  // it only when Resend actually took the message. Stamping it unconditionally
  // left the org's own records claiming a receipt had reached someone who never
  // got one — and suppressed the resend that would otherwise happen on the next
  // event once RESEND_API_KEY is configured.
  if (!sent) {
    console.error('[PAWTX] Receipt was not sent; leaving receipt_sent_at unset', donation.id);
    return;
  }

  await supabase
    .from('donations')
    .update({ receipt_sent_at: new Date().toISOString() })
    .eq('id', donation.id);
}
