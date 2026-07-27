import type { PostgrestError } from '@supabase/supabase-js';
import type { ActionError } from '../../types';
import { SupabaseNotConfiguredError } from '../supabaseClient';

/**
 * Custom SQLSTATEs raised by `create_rsvp()` in the RLS migration. PostgREST
 * passes the SQLSTATE straight through as `error.code`, which is how the UI
 * tells "this event is full" apart from "you already registered" without
 * string-matching an error message that could be reworded later.
 */
const SQLSTATE_TO_ACTION_ERROR: Record<string, ActionError> = {
  PA001: 'event_full',
  PA002: 'already_registered',
  PA003: 'event_not_found',
  PA004: 'invalid_guest_count',
  // A shift signup that would exceed spots_total trips the
  // shifts_not_overbooked CHECK constraint inside the sync trigger.
  '23514': 'shift_full',
  // Unique violation on shift_signups — already signed up for this shift.
  '23505': 'already_registered',
  // RLS rejected the write: the caller isn't who they need to be.
  '42501': 'unauthenticated'
};

export function toActionError(error: unknown): ActionError {
  if (error instanceof SupabaseNotConfiguredError) return 'not_configured';

  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as PostgrestError).code);
    if (code in SQLSTATE_TO_ACTION_ERROR) return SQLSTATE_TO_ACTION_ERROR[code];
  }

  return 'network';
}

/**
 * Logs the underlying failure while returning the coarse code the UI shows.
 * Read failures are never surfaced verbatim — a Postgres message can leak
 * column and policy names to anyone with a console open.
 */
export function reportError(context: string, error: unknown): ActionError {
  console.error(`[PAWTX] ${context}`, error);
  return toActionError(error);
}
