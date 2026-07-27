import { VolunteerProfile } from '../../types';
import type { Tables } from '../database.types';
import { requireSupabase } from '../supabaseClient';
import { formatJoinedLabel, parseTimestamp } from '../formatEventDate';
import { sumHours, type ServiceLogRow } from './serviceLog';

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
 * Service statistics, read from the verified ledger.
 *
 * These used to be derived in the browser from the shifts the volunteer had
 * claimed whose end time had passed — which credited anyone who signed up and
 * never turned up. Now a row exists in `service_log` only because an admin
 * closed a roster and put it there, so "hours served" means hours somebody
 * watched being served. See supabase/migrations/*_service_log.sql.
 */
export function computeVolunteerStats(
  log: readonly ServiceLogRow[]
): { totalHours: number; shiftsCompleted: number } {
  return {
    totalHours: sumHours(log),
    // One credited row per shift, guaranteed by the unique index on
    // (user_id, shift_id), so counting rows counts shifts.
    shiftsCompleted: log.length
  };
}

export function mapProfileRow(
  row: ProfileRow,
  log: readonly ServiceLogRow[],
  language: 'en' | 'es'
): VolunteerProfile {
  const joined = parseTimestamp(row.joined_at);
  const stats = computeVolunteerStats(log);

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
