import { Shift } from '../../types';
import type { Tables } from '../database.types';
import { requireSupabase } from '../supabaseClient';
import { formatEventDayLabel, formatEventTimeRange, parseTimestamp } from '../formatEventDate';

export type ShiftRow = Tables<'shifts'>;

export function mapShiftRow(
  row: ShiftRow,
  language: 'en' | 'es',
  takenShiftIds: ReadonlySet<string>
): Shift {
  const start = parseTimestamp(row.starts_at);
  const end = parseTimestamp(row.ends_at);

  return {
    id: row.id,
    title: row.title,
    titleEs: row.title_es,
    role: row.role,
    roleEs: row.role_es,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    date: start ? formatEventDayLabel(start, language) : '',
    time: start ? formatEventTimeRange(start, end, language) : '',
    // Generated column in Postgres; Postgrest returns numerics as numbers here
    // but a string slips through on some driver versions, hence the coercion.
    durationHours: Number(row.duration_hours),
    spotsTotal: row.spots_total,
    spotsFilled: row.spots_filled,
    description: row.description,
    descriptionEs: row.description_es,
    isTakenByMe: takenShiftIds.has(row.id)
  };
}

export async function fetchShifts(): Promise<ShiftRow[]> {
  const { data, error } = await requireSupabase()
    .from('shifts')
    .select('*')
    .eq('published', true)
    .order('starts_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/**
 * Every shift, drafts included, for the admin panel.
 *
 * `fetchShifts` above filters on `published` in the client. RLS already lets an
 * admin read unpublished rows ("shifts: read published" is `published or
 * is_admin()`), so that filter — not the database — is what would otherwise
 * hide a draft from the person who just saved it.
 *
 * Newest first, the opposite of the public list: staff are usually looking for
 * the shift they just created, while volunteers want the next one coming up.
 */
/**
 * Titles for a specific set of shift ids, keyed by id.
 *
 * Used by the certificate screen to label each service_log entry with what
 * the volunteer actually did, rather than a bare date and a number of hours.
 * Deliberately not filtered on `published`: a shift can be unpublished long
 * after it happened, and the hours already credited for it still deserve a
 * real label on a certificate.
 */
export async function fetchShiftTitlesByIds(
  ids: readonly string[]
): Promise<Map<string, { title: string; titleEs: string }>> {
  if (ids.length === 0) return new Map();

  const { data, error } = await requireSupabase()
    .from('shifts')
    .select('id, title, title_es')
    .in('id', ids);

  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.id, { title: row.title, titleEs: row.title_es }]));
}

export async function fetchAllShiftsForAdmin(): Promise<ShiftRow[]> {
  const { data, error } = await requireSupabase()
    .from('shifts')
    .select('*')
    .order('starts_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/**
 * Shift ids the signed-in volunteer has claimed.
 *
 * The `user_id` filter is required, not redundant: the "admins manage all"
 * policy lets staff see every volunteer's signups, so without it an admin's
 * own schedule would show every shift anyone had claimed.
 */
export async function fetchMyShiftSignups(userId: string): Promise<string[]> {
  const { data, error } = await requireSupabase()
    .from('shift_signups')
    .select('shift_id')
    .eq('user_id', userId);

  if (error) throw error;
  return (data ?? []).map((row) => row.shift_id);
}

export async function claimShift(shiftId: string, userId: string): Promise<void> {
  // The trigger on shift_signups bumps shifts.spots_filled, and the
  // shifts_not_overbooked CHECK rejects the insert when the shift is full.
  const { error } = await requireSupabase()
    .from('shift_signups')
    .insert({ shift_id: shiftId, user_id: userId });

  if (error) throw error;
}

export async function releaseShift(shiftId: string, userId: string): Promise<void> {
  const { error } = await requireSupabase()
    .from('shift_signups')
    .delete()
    .eq('shift_id', shiftId)
    .eq('user_id', userId);

  if (error) throw error;
}
