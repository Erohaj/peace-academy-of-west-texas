import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { emailLayout, escapeHtml, sendEmail } from '../_shared/email.ts';

/**
 * Stripe webhook — the only writer that marks a donation as paid.
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
        // so record each subsequent charge as its own donation.
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

  await sendEmail({
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
          <div style="font-weight:700;margin-bottom:8px;">Official Donation Receipt</div>
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
          ${
            ORG_EIN
              ? 'No goods or services were provided in exchange for this contribution. Keep this receipt for your tax records.'
              : 'A formal receipt for your tax records will follow by email from our team.'
          }
        </p>
      `
    )
  });

  await supabase
    .from('donations')
    .update({ receipt_sent_at: new Date().toISOString() })
    .eq('id', donation.id);
}
