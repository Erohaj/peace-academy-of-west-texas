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
