import type { AttendanceRow, Tables } from '../database.types';
import type { EventVolunteer } from '../../types';
import { requireSupabase } from '../supabaseClient';

export type EventVolunteerRow = Tables<'event_volunteers'>;

export function mapEventVolunteerRow(row: EventVolunteerRow): EventVolunteer {
  return {
    id: row.id,
    shiftId: row.shift_id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    note: row.note,
    attendance: row.attendance,
    language: row.language,
    createdAt: row.created_at
  };
}

export interface SignUpEventVolunteerInput {
  shiftId: string;
  fullName: string;
  email: string;
  phone?: string;
  /** Anything the shift lead should know: when they have to leave, who they are bringing. */
  note?: string;
  /** Side of the bilingual site they signed up from, stored for a later reminder. */
  language: 'en' | 'es';
}

/**
 * Signs a volunteer up for one shift without an account.
 *
 * Goes through the `signup_event_volunteer` database function because INSERT on
 * `event_volunteers` is revoked from both roles — the same arrangement RSVPs
 * use. The function holds a `FOR UPDATE` lock on the shift while it checks
 * capacity, so never re-add a "spots remaining" check here: the number this
 * browser is holding was read when the page loaded, and two people looking at
 * the last place both see it free.
 *
 * Throws a PostgrestError whose `code` carries the reason (PA012 shift gone,
 * PA013 shift over, PA014 full, PA015 already signed up); see
 * src/lib/api/errors.ts.
 */
export async function signUpEventVolunteer(
  input: SignUpEventVolunteerInput
): Promise<EventVolunteerRow> {
  const { data, error } = await requireSupabase().rpc('signup_event_volunteer', {
    p_shift_id: input.shiftId,
    p_full_name: input.fullName,
    p_email: input.email,
    p_phone: input.phone ?? null,
    p_note: input.note ?? null,
    p_language: input.language
  });

  if (error) throw error;
  return data as EventVolunteerRow;
}

/** A signup with the shift it belongs to, which is where the role and times live. */
export interface EventVolunteerEntry extends EventVolunteer {
  shiftTitle: string;
  shiftTitleEs: string;
  shiftStartsAt: string;
  shiftEndsAt: string;
}

/**
 * Admin panel: every no-account signup across one event's shifts.
 *
 * `shifts!inner` is what makes the `shifts.event_id` filter a join condition
 * rather than a filter on a column that is not there — `event_volunteers` has
 * no `event_id` of its own, deliberately, since the shift already carries it.
 *
 * Ordered oldest first, the opposite of the RSVP list: this one gets read on
 * the day as a roster to tick down, not as an inbox.
 */
export async function fetchEventVolunteers(eventId: string): Promise<EventVolunteerEntry[]> {
  const { data, error } = await requireSupabase()
    .from('event_volunteers')
    .select('*, shifts!inner ( event_id, title, title_es, starts_at, ends_at )')
    .eq('shifts.event_id', eventId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => {
    // PostgREST types an embedded to-one relation as possibly an array.
    const shift = Array.isArray(row.shifts) ? row.shifts[0] : row.shifts;

    return {
      ...mapEventVolunteerRow(row as EventVolunteerRow),
      shiftTitle: shift?.title ?? '',
      shiftTitleEs: shift?.title_es ?? '',
      shiftStartsAt: shift?.starts_at ?? '',
      shiftEndsAt: shift?.ends_at ?? ''
    };
  });
}

/**
 * How many people signed up for a shift without an account.
 *
 * `ShiftRoster` needs this and only this: the roster it closes reads
 * `shift_signups`, so without a count beside it staff would credit hours from
 * a list that is missing everyone who came through the public form. A count is
 * enough to say "there are more people than this screen can process" without
 * putting names and phone numbers on a screen about crediting hours.
 */
export async function countEventVolunteersForShift(shiftId: string): Promise<number> {
  const { count, error } = await requireSupabase()
    .from('event_volunteers')
    .select('id', { count: 'exact', head: true })
    .eq('shift_id', shiftId);

  if (error) throw error;
  return count ?? 0;
}

/**
 * Records what staff observed. Credits nothing — there is no profile to credit,
 * which is the whole trade of the no-account path.
 *
 * Only `attendance` is writable: the table-wide UPDATE is revoked and this one
 * column granted back, so a name or a phone number cannot be rewritten after
 * the fact.
 */
export async function setEventVolunteerAttendance(
  id: string,
  attendance: AttendanceRow | null
): Promise<void> {
  const { error } = await requireSupabase()
    .from('event_volunteers')
    .update({ attendance })
    .eq('id', id);

  if (error) throw error;
}

/**
 * Cancels a signup and gives the place back.
 *
 * Safe in a way deleting an RSVP is not: the `event_volunteers_sync_count`
 * trigger decrements `shifts.spots_filled` in the same statement, so the count
 * cannot be left overstated.
 */
export async function deleteEventVolunteer(id: string): Promise<void> {
  const { error } = await requireSupabase().from('event_volunteers').delete().eq('id', id);

  if (error) throw error;
}
