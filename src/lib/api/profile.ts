import { Shift, VolunteerProfile } from '../../types';
import type { Tables } from '../database.types';
import { requireSupabase } from '../supabaseClient';
import { formatJoinedLabel, parseTimestamp } from '../formatEventDate';

export type ProfileRow = Tables<'profiles'>;

/**
 * The signed-in user's profile.
 *
 * The `id` filter is load-bearing and must not be dropped as "RLS already does
 * it". RLS restricts an ordinary volunteer to their own row, but the
 * "admins read all" policy widens `select` to every profile — without the
 * filter, `maybeSingle()` would fail for staff the moment a second volunteer
 * signs up.
 */
export async function fetchMyProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await requireSupabase()
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateMyProfile(
  userId: string,
  patch: { full_name?: string | null; phone?: string | null; avatar_url?: string | null }
): Promise<void> {
  // Same reasoning, with sharper consequences: an unfiltered update run by an
  // admin would rewrite every profile the admin policy exposes.
  const { error } = await requireSupabase().from('profiles').update(patch).eq('id', userId);
  if (error) throw error;
}

/**
 * Service statistics, derived from the shifts already loaded for the portal
 * rather than re-queried.
 *
 * Only shifts that have actually finished count. The labels on these figures
 * are "Service Hours Logged" and "Shifts Completed", and the previous mock
 * credited both the moment a volunteer clicked a future shift — which read as
 * hours served that nobody had served yet.
 */
export function computeVolunteerStats(
  shifts: readonly Shift[],
  now: Date = new Date()
): { totalHours: number; shiftsCompleted: number } {
  const completed = shifts.filter((shift) => {
    if (!shift.isTakenByMe) return false;
    const end = parseTimestamp(shift.endsAt);
    return end !== null && end.getTime() <= now.getTime();
  });

  const totalHours = completed.reduce((sum, shift) => sum + shift.durationHours, 0);

  return {
    // Durations are stored to 2dp; rounding keeps "7.5 hrs" from rendering as
    // 7.500000000000001 after a few additions.
    totalHours: Math.round(totalHours * 10) / 10,
    shiftsCompleted: completed.length
  };
}

export function mapProfileRow(
  row: ProfileRow,
  shifts: readonly Shift[],
  language: 'en' | 'es'
): VolunteerProfile {
  const joined = parseTimestamp(row.joined_at);
  const stats = computeVolunteerStats(shifts);

  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name || row.email,
    phone: row.phone ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    role: row.role,
    totalHours: stats.totalHours,
    shiftsCompleted: stats.shiftsCompleted,
    badges: row.badges ?? [],
    joinedDate: joined ? formatJoinedLabel(joined, language) : ''
  };
}
