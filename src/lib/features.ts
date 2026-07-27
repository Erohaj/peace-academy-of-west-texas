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

/** Address shown when a visitor wants to give but online payment is disabled. */
export const CONTACT_EMAIL = 'paowtx@gmail.com';
