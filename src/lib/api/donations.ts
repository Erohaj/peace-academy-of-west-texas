import type { Tables } from '../database.types';
import { getSiteUrl, requireSupabase } from '../supabaseClient';

export type DonationRow = Tables<'donations'>;

export interface CheckoutInput {
  /** Whole dollars as entered in the widget; converted to cents server-side. */
  amount: number;
  frequency: 'one_time' | 'monthly';
  donorName?: string;
  donorEmail?: string;
}

/**
 * Creates a Stripe Checkout Session and returns the hosted payment URL.
 *
 * Card details are never touched by this application — the browser is
 * redirected to Stripe's own page. The previous widget collected a raw card
 * number into React state, which put the site inside PCI scope and sent the
 * number nowhere at all.
 *
 * The amount is re-validated inside the Edge Function; anything a client sends
 * is a request, not an instruction.
 */
export async function createCheckoutSession(input: CheckoutInput): Promise<string> {
  const { data, error } = await requireSupabase().functions.invoke<{ url: string }>(
    'create-checkout-session',
    {
      body: {
        amount: input.amount,
        frequency: input.frequency,
        donorName: input.donorName ?? '',
        donorEmail: input.donorEmail ?? '',
        // The site lives under a GitHub Pages project path, so the return URL
        // cannot be assumed to be the origin root.
        returnUrl: getSiteUrl()
      }
    }
  );

  if (error) throw error;
  if (!data?.url) throw new Error('Checkout session did not return a URL');

  return data.url;
}

/**
 * Looks up a completed donation after Stripe redirects back, so the thank-you
 * screen can show a real amount instead of trusting the query string.
 *
 * Returns null while the webhook has not landed yet — Stripe redirects the
 * browser and calls the webhook independently, and the redirect usually wins
 * the race by a second or two.
 */
export async function fetchDonationBySession(sessionId: string): Promise<DonationRow | null> {
  const { data, error } = await requireSupabase().functions.invoke<DonationRow | null>(
    'donation-status',
    { body: { sessionId } }
  );

  if (error) throw error;
  return data ?? null;
}

/** Admin panel: recent donations, newest first. */
export async function fetchDonations(limit = 200): Promise<DonationRow[]> {
  const { data, error } = await requireSupabase()
    .from('donations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}
