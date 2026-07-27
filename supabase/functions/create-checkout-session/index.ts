import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { errorResponse, handleCors, jsonResponse } from '../_shared/cors.ts';

/**
 * Creates a Stripe Checkout Session and hands back the hosted payment URL.
 *
 * The browser never sees card data: it is redirected to Stripe's own page.
 * The previous donation widget collected a raw card number into React state
 * and posted it nowhere, which put the site inside PCI scope for no benefit.
 */

// Donations outside this range are almost certainly a typo or an attack, and a
// $1,000,000 Checkout session would be an unpleasant surprise for the org.
const MIN_AMOUNT_CENTS = 100;
const MAX_AMOUNT_CENTS = 5_000_000; // $50,000

interface CheckoutPayload {
  amount?: number;
  frequency?: 'one_time' | 'monthly';
  donorName?: string;
  donorEmail?: string;
  returnUrl?: string;
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) {
    console.error('[PAWTX] STRIPE_SECRET_KEY is not set');
    return errorResponse('Payments are not configured', 500);
  }

  let payload: CheckoutPayload;
  try {
    payload = await req.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const frequency = payload.frequency === 'monthly' ? 'monthly' : 'one_time';

  // The amount arrives from a form field the visitor controls, so it is a
  // request rather than an instruction — validate it here, not in the browser.
  const amountCents = Math.round(Number(payload.amount) * 100);
  if (!Number.isFinite(amountCents) || amountCents < MIN_AMOUNT_CENTS || amountCents > MAX_AMOUNT_CENTS) {
    return errorResponse('Invalid donation amount');
  }

  const donorEmail = (payload.donorEmail ?? '').trim().toLowerCase();
  const donorName = (payload.donorName ?? '').trim().slice(0, 120);

  // The site is served from a GitHub Pages project path, so the return URL
  // cannot be assumed to be the origin root. SITE_URL is the trusted default;
  // the client-supplied value is only honoured when it matches that origin.
  const configuredSite = Deno.env.get('SITE_URL') ?? '';
  const returnUrl = pickReturnUrl(payload.returnUrl, configuredSite);
  if (!returnUrl) return errorResponse('Return URL is not allowed');

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-12-18.acacia' });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  try {
    const session = await stripe.checkout.sessions.create({
      mode: frequency === 'monthly' ? 'subscription' : 'payment',
      // Stripe collects and verifies the email itself when we don't supply one.
      ...(donorEmail ? { customer_email: donorEmail } : {}),
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amountCents,
            product_data: {
              name:
                frequency === 'monthly'
                  ? 'Monthly donation to Peace Academy of West Texas'
                  : 'Donation to Peace Academy of West Texas'
            },
            ...(frequency === 'monthly' ? { recurring: { interval: 'month' as const } } : {})
          },
          quantity: 1
        }
      ],
      // The webhook reads these back to reconcile the pending donation row.
      metadata: {
        donor_name: donorName,
        frequency
      },
      // Subscriptions carry metadata separately from the Checkout Session, and
      // invoice.paid events reference the subscription rather than the session.
      ...(frequency === 'monthly'
        ? { subscription_data: { metadata: { donor_name: donorName, frequency } } }
        : {}),
      success_url: `${returnUrl}?donation=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnUrl}?donation=cancelled`
    });

    // Recorded as pending now so a donation is never invisible, even if the
    // webhook is delayed or misconfigured.
    const { error: insertError } = await supabase.from('donations').insert({
      stripe_session_id: session.id,
      amount_cents: amountCents,
      currency: 'usd',
      frequency,
      donor_name: donorName || null,
      donor_email: donorEmail || null,
      status: 'pending'
    });

    if (insertError) {
      console.error('[PAWTX] Failed to record pending donation', insertError);
    }

    return jsonResponse({ url: session.url });
  } catch (error) {
    console.error('[PAWTX] Stripe checkout session creation failed', error);
    return errorResponse('Could not start the payment', 502);
  }
});

/**
 * Accepts the client's return URL only when it lives on an allowed origin, so
 * a crafted request cannot turn a PAWTX Checkout page into a redirect to
 * somewhere else after payment.
 *
 * SITE_URL may hold several comma-separated URLs — the production site plus
 * http://localhost:3000 for development. The first entry is the fallback used
 * when the caller sends nothing usable. Supporting a list avoids the obvious
 * trap of pointing SITE_URL at localhost to test and then shipping it that
 * way, which would send real donors to a dead address after paying.
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
