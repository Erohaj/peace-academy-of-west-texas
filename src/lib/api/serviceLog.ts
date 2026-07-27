import type { AttendanceRow, Tables } from '../database.types';
import { requireSupabase } from '../supabaseClient';

export type ServiceLogRow = Tables<'service_log'>;

/** One volunteer on a shift's roster, with whatever has already been credited. */
export interface RosterEntry {
  signupId: string;
  userId: string;
  fullName: string;
  email: string;
  attendance: AttendanceRow | null;
  /** The service_log row for this shift, if the roster has been closed once. */
  loggedHours: number | null;
}

/**
 * The signed-in volunteer's credited hours.
 *
 * Every row here was entered by an admin — there is no "pending" state to
 * filter out, because a volunteer cannot write to this table at all.
 */
export async function fetchMyServiceLog(userId: string): Promise<ServiceLogRow[]> {
  const { data, error } = await requireSupabase()
    .from('service_log')
    .select('*')
    .eq('user_id', userId)
    .order('served_on', { ascending: false });

  if (error) {
    // The one error worth surviving: this table arrives in a migration, and a
    // deploy can reach visitors before someone has run it. This call sits in
    // the same Promise.all as the profile load, so letting it throw would take
    // the whole volunteer portal down for everyone until the migration lands.
    // An empty ledger is the truth in that state anyway — nothing is credited.
    // Every other failure propagates: silently reporting zero hours to someone
    // who has served fifty is worse than an error screen.
    if (isMissingTable(error)) {
      console.error(
        '[PAWTX] service_log is missing — run `npm run db:push` (or apply ' +
          'supabase/migrations/*_service_log.sql). Volunteer hours will read as zero until then.'
      );
      return [];
    }
    throw error;
  }

  return data ?? [];
}

/** PostgREST reports an unknown relation as PGRST205, or Postgres 42P01. */
const isMissingTable = (error: { code?: string | null }): boolean =>
  error.code === 'PGRST205' || error.code === '42P01';

/** Total credited hours, rounded the way the portal displays them. */
export const sumHours = (rows: readonly ServiceLogRow[]): number =>
  Math.round(rows.reduce((total, row) => total + Number(row.hours), 0) * 10) / 10;

/**
 * Who claimed a shift, and what they have been credited for it.
 *
 * Reads two tables rather than one embedded query: the signups carry the
 * roster and the volunteer's name, while service_log carries the credit, and
 * there is no foreign key between them to embed across.
 */
export async function fetchRoster(shiftId: string): Promise<RosterEntry[]> {
  const supabase = requireSupabase();

  const [signups, logged] = await Promise.all([
    supabase
      .from('shift_signups')
      .select('id, user_id, attendance, profiles ( full_name, email )')
      .eq('shift_id', shiftId),
    supabase.from('service_log').select('user_id, hours').eq('shift_id', shiftId)
  ]);

  if (signups.error) throw signups.error;
  if (logged.error) throw logged.error;

  const hoursByUser = new Map<string, number>(
    (logged.data ?? []).map((row) => [row.user_id, Number(row.hours)])
  );

  return (signups.data ?? []).map((row) => {
    // PostgREST types an embedded to-one relation as possibly an array.
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;

    return {
      signupId: row.id,
      userId: row.user_id,
      fullName: profile?.full_name || profile?.email || 'Unknown volunteer',
      email: profile?.email ?? '',
      attendance: row.attendance,
      loggedHours: hoursByUser.get(row.user_id) ?? null
    };
  });
}

export interface RosterDecision {
  userId: string;
  attendance: AttendanceRow;
  /** Ignored unless `attendance` is 'attended'. */
  hours: number;
}

/**
 * Closes a shift's roster: records what staff observed, and credits hours to
 * everyone who turned up.
 *
 * Re-closing a roster is a correction, not a second payment — the unique index
 * on (user_id, shift_id) turns the upsert into an update. A volunteer marked
 * as a no-show after previously being credited has that credit removed, which
 * is the only way to undo a mistake without going into the SQL editor.
 *
 * Not a transaction. PostgREST has no way to open one from the browser, so a
 * failure part-way leaves some rows written; re-saving the roster is safe and
 * converges, which is why every write here is idempotent.
 */
export async function closeRoster(
  shiftId: string,
  servedOn: string,
  decisions: readonly RosterDecision[],
  verifiedBy: string
): Promise<void> {
  const supabase = requireSupabase();

  const attended = decisions.filter((entry) => entry.attendance === 'attended');
  const absent = decisions.filter((entry) => entry.attendance === 'no_show');

  for (const entry of decisions) {
    const { error } = await supabase
      .from('shift_signups')
      .update({ attendance: entry.attendance })
      .eq('shift_id', shiftId)
      .eq('user_id', entry.userId);
    if (error) throw error;
  }

  if (attended.length > 0) {
    const { error } = await supabase.from('service_log').upsert(
      attended.map((entry) => ({
        user_id: entry.userId,
        shift_id: shiftId,
        source: 'shift' as const,
        hours: entry.hours,
        served_on: servedOn,
        verified_by: verifiedBy
      })),
      { onConflict: 'user_id,shift_id' }
    );
    if (error) throw error;
  }

  if (absent.length > 0) {
    const { error } = await supabase
      .from('service_log')
      .delete()
      .eq('shift_id', shiftId)
      .in(
        'user_id',
        absent.map((entry) => entry.userId)
      );
    if (error) throw error;
  }
}
