/// <reference types="vite/client" />
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/**
 * Supabase client for the PAWTX site.
 *
 * The bundle is served statically from GitHub Pages, so these two values ship
 * to every visitor. That is by design — the anon key is a public identifier,
 * and the actual security boundary is the RLS policy set in
 * supabase/migrations/*_rls_and_rpc.sql. Never put a service role key, a
 * Stripe secret, or a mail provider key behind a VITE_ prefix: Vite inlines
 * them into the JavaScript. Those belong in Edge Function secrets.
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = (): boolean => Boolean(supabaseUrl && supabaseAnonKey);

/**
 * `null` when the environment variables are missing.
 *
 * An earlier version defaulted to `https://placeholder-pawtx.supabase.co`,
 * which made a misconfigured deploy fail as an opaque DNS error at request
 * time instead of an obvious one at startup. Missing config is now visible
 * immediately and surfaces to the UI through `dataStatus: 'error'`.
 */
export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured()
  ? createClient<Database>(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        // Magic-link callbacks arrive as a URL fragment; the SDK consumes and
        // clears it on load. This app has no router, so nothing else would.
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
        flowType: 'pkce'
      }
    })
  : null;

if (!isSupabaseConfigured() && import.meta.env.DEV) {
  console.error(
    '[PAWTX] Supabase is not configured. Copy .env.example to .env.local and set ' +
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Events, RSVPs, the volunteer ' +
      'portal and donations will all be unavailable until you do.'
  );
}

/** Thrown by `requireSupabase()`; the store maps it to a user-facing message. */
export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing).');
    this.name = 'SupabaseNotConfiguredError';
  }
}

export function requireSupabase(): SupabaseClient<Database> {
  if (!supabase) throw new SupabaseNotConfiguredError();
  return supabase;
}

/**
 * Absolute URL of this deployment, including the trailing path.
 *
 * Needed because the production site lives under the GitHub Pages project
 * path (`/peace-academy-of-west-texas/`, see `base` in vite.config.ts) while
 * dev and preview run at the root. Auth magic links and Stripe return URLs
 * must both point at the real path, and the same value has to be listed in
 * Supabase → Authentication → URL Configuration → Redirect URLs.
 */
export function getSiteUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return new URL(base, window.location.origin).toString();
}

/**
 * Warns, in development only, about the one auth failure that gives no sign of
 * itself.
 *
 * When the requested return address is not on the Redirect URLs allowlist,
 * Supabase does not reject the call — it quietly substitutes the project's
 * Site URL. Nothing fails, no error is returned, and the sign-in link simply
 * arrives pointing at production. Someone testing against a local dev server
 * clicks it, lands on the deployed site, and reasonably concludes their
 * changes never took effect.
 *
 * Note the trailing slash below: `http://localhost:3000` and
 * `http://localhost:3000/` are different entries as far as the allowlist is
 * concerned, which is why the wildcard form is the one to add.
 */
export function warnIfRedirectLikelyUnlisted(redirectTo: string): void {
  if (!import.meta.env.DEV) return;

  console.info(
    `[PAWTX] Sign-in link will return to ${redirectTo}\n` +
      'If you land on the deployed GitHub Pages site instead, that address is ' +
      'missing from Supabase → Authentication → URL Configuration → Redirect ' +
      `URLs, and Supabase fell back to the project's Site URL. Add ` +
      `${new URL(redirectTo).origin}/** there.`
  );
}

/** URL of a deployed Edge Function, e.g. `create-checkout-session`. */
export function functionUrl(name: string): string {
  if (!supabaseUrl) throw new SupabaseNotConfiguredError();
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/${name}`;
}
