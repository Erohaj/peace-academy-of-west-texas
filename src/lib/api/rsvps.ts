import type { Tables } from '../database.types';
import type { MediaConsent } from '../../types';
import { requireSupabase } from '../supabaseClient';

export type RsvpRow = Tables<'rsvps'>;

export interface CreateRsvpInput {
  eventId: string;
  fullName: string;
  email: string;
  phone?: string;
  guestCount: number;
  optionalDonation?: number;
  /** Required when the event has `collect_media_consent` on; the function rejects the booking otherwise. */
  mediaConsent?: MediaConsent | null;
}

/**
 * Books an RSVP through the `create_rsvp` database function.
 *
 * Direct inserts into `rsvps` are revoked from both anon and authenticated —
 * this RPC is the only way in. It holds a `FOR UPDATE` lock on the event row
 * while checking capacity, which is what stops two simultaneous submissions
 * from overbooking the last seat.
 *
 * Throws a PostgrestError whose `code` carries the reason (PA001 event_full,
 * PA002 already_registered, …); see src/lib/api/errors.ts.
 */
export async function createRsvp(input: CreateRsvpInput): Promise<RsvpRow> {
  const { data, error } = await requireSupabase().rpc('create_rsvp', {
    p_event_id: input.eventId,
    p_full_name: input.fullName,
    p_email: input.email,
    p_phone: input.phone ?? null,
    p_guest_count: input.guestCount,
    p_optional_donation: input.optionalDonation ?? 0,
    p_media_consent: input.mediaConsent ?? null
  });

  if (error) throw error;
  return data as RsvpRow;
}

/** Admin panel: every RSVP for one event. */
export async function fetchRsvpsForEvent(eventId: string): Promise<RsvpRow[]> {
  const { data, error } = await requireSupabase()
    .from('rsvps')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/** Admin panel: the full RSVP list across all events. */
export async function fetchAllRsvps(): Promise<RsvpRow[]> {
  const { data, error } = await requireSupabase()
    .from('rsvps')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}
