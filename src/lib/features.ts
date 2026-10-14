/// <reference types="vite/client" />

/**
 * Build-time feature flags.
 *
 * Donations depend on a Stripe account and on the create-checkout-session Edge
 * Function being deployed. Until both exist, the widget must not offer a button
 * that can only fail — a donate form that errors every time is worse for a
 * nonprofit than an honest "not yet".
 *
 * Flip by setting VITE_DONATIONS_ENABLED=true in .env.local and in the GitHub
 * Actions build environment.
 */
export const donationsEnabled = import.meta.env.VITE_DONATIONS_ENABLED === 'true';

/**
 * Whether outbound transactional email actually works.
 *
 * Requires RESEND_API_KEY in the Edge Function secrets AND the Database
 * Webhook on `rsvps` that triggers send-rsvp-confirmation. Until both exist,
 * confirmation screens must not claim "we have sent you an email" — a promise
 * the visitor will check their inbox for, and find nothing.
 *
 * Flip by setting VITE_EMAIL_ENABLED=true in .env.local and in the GitHub
 * Actions build environment.
 */
export const emailEnabled = import.meta.env.VITE_EMAIL_ENABLED === 'true';

/**
 * Whether the site may take payment for a seat at an event.
 *
 * Distinct from `donationsEnabled`, and not implied by it. A working Stripe
 * account is only half of what this needs: the other half is the
 * `create-ticket-session` and `ticket-status` Edge Functions deployed, the
 * `stripe-webhook` build current enough to know what `kind: 'event_ticket'`
 * means, and the prepaid-ticket migration applied. Until all four are true, a
 * visitor sent to Checkout for a seat is a visitor whose money arrives
 * somewhere nothing is listening — and a held seat nothing will ever release.
 *
 * With the flag off, nothing about an event changes except that it cannot be
 * marked prepaid: `fee` goes on being a published figure, the RSVP form books
 * free seats as it always has, and the admin panel does not offer the toggle.
 * An event somehow already marked prepaid shows the contact address instead of
 * a payment button, the same way `DonationWidget` does with donations off.
 *
 * Flip by setting VITE_TICKETS_ENABLED=true in .env.local and in the GitHub
 * Actions build environment — production stays off without the second one,
 * whatever .env.local says.
 */
export const ticketsEnabled = import.meta.env.VITE_TICKETS_ENABLED === 'true';

/**
 * Whether the RSVP flow may show its "Optional Event Support" step.
 *
 * Deliberately a constant here rather than a VITE_ flag: this is a property of
 * the code, not of the environment. An env switch would invite someone to turn
 * the step on without wiring it to Checkout, which is the exact failure it
 * guards against.
 *
 * The step offers $10/$25/$50 under copy about tax-deductible giving and then
 * writes the number into the `rsvps` row. It has never called
 * create-checkout-session: no card is asked for and nothing is charged, so
 * someone who picks $25 leaves believing they gave $25. The amount then shows
 * up in the admin panel and the CSV export as a donation that is not money,
 * which misleads the organisation about its own income as well as the donor.
 *
 * It used to be gated on `donationsEnabled`, which was correct while that flag
 * meant "Stripe is not wired up at all". When donations went live on
 * 2026-10-10 the flag stopped meaning that, and this step switched itself back
 * on while still being unable to charge.
 *
 * Set this true only in the same change that makes the step collect the money:
 * a Checkout redirect once the RSVP row exists, and a return path that
 * reconciles the two. The explicit `boolean` type keeps the step's own code
 * type-checked while the answer is no.
 */
export const rsvpDonationEnabled: boolean = false;

/** Address shown when a visitor wants to give or book but payment is off. */
export { ORG_EMAIL as CONTACT_EMAIL } from '../data/orgLinks';
