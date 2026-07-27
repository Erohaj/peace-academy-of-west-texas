import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, X, ClipboardCheck } from 'lucide-react';
import type { AttendanceRow, Tables } from '../../lib/database.types';
import { closeRoster, fetchRoster, type RosterEntry } from '../../lib/api/serviceLog';
import { useAppStore } from '../../store/useAppStore';
import { instantToWallClock } from '../../lib/formatEventDate';

type ShiftRow = Tables<'shifts'>;

interface Props {
  shift: ShiftRow;
  onClose: () => void;
  /** Lets the parent refresh its list once hours have been credited. */
  onSaved: () => void;
}

interface Decision {
  attendance: AttendanceRow | null;
  hours: string;
}

/**
 * Closing a shift's roster — the step that turns "signed up" into hours the
 * organisation is willing to certify.
 *
 * Everyone starts unmarked rather than defaulted to "attended": a roster
 * saved by clicking straight through would credit no-shows, which is the
 * failure this whole mechanism exists to prevent.
 */
export const ShiftRoster: React.FC<Props> = ({ shift, onClose, onSaved }) => {
  const adminId = useAppStore((state) => state.volunteer?.id);

  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [servedOn, setServedOn] = useState(() => instantToWallClock(shift.starts_at).slice(0, 10));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shiftHasEnded = new Date(shift.ends_at).getTime() <= Date.now();

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const roster = await fetchRoster(shift.id);
      setEntries(roster);
      // Re-opening a closed roster shows what was decided last time, so a
      // correction only has to touch the row that was wrong.
      setDecisions(
        Object.fromEntries(
          roster.map((entry) => [
            entry.userId,
            {
              attendance: entry.attendance,
              hours: String(entry.loggedHours ?? Number(shift.duration_hours))
            }
          ])
        )
      );
    } catch (loadError) {
      console.error('[PAWTX] Failed to load roster', loadError);
      setError('Could not load who signed up for this shift.');
    } finally {
      setIsLoading(false);
    }
  }, [shift.id, shift.duration_hours]);

  useEffect(() => {
    void load();
  }, [load]);

  const setAttendance = (userId: string, attendance: AttendanceRow) =>
    setDecisions((current) => ({
      ...current,
      [userId]: { ...current[userId], attendance }
    }));

  const setHours = (userId: string, hours: string) =>
    setDecisions((current) => ({
      ...current,
      [userId]: { ...current[userId], hours }
    }));

  const handleSave = async () => {
    if (!adminId) {
      setError('Your session expired. Sign in again before crediting hours.');
      return;
    }

    const marked = entries
      .map((entry) => ({ entry, decision: decisions[entry.userId] }))
      .filter((row) => row.decision?.attendance);

    if (marked.length === 0) {
      setError('Mark at least one volunteer as attended or a no-show.');
      return;
    }

    const invalid = marked.find(
      (row) =>
        row.decision.attendance === 'attended' &&
        !(Number(row.decision.hours) > 0 && Number(row.decision.hours) <= 24)
    );
    if (invalid) {
      setError(`Hours for ${invalid.entry.fullName} must be between 0 and 24.`);
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await closeRoster(
        shift.id,
        servedOn,
        marked.map((row) => ({
          userId: row.entry.userId,
          attendance: row.decision.attendance as AttendanceRow,
          hours: Number(row.decision.hours)
        })),
        adminId
      );
      await load();
      onSaved();
    } catch (saveError) {
      console.error('[PAWTX] Failed to close roster', saveError);
      setError(
        'Could not save the roster. If the date is in the future, the database rejects it — hours cannot be credited before they are served.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const pill = 'px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider cursor-pointer transition-colors flex items-center gap-1.5';

  return (
    <div className="bg-[#F4F1ED] border border-[#E5E0D8] rounded-2xl p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-serif font-bold text-lg flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-[#A64D32]" />
            Roster — {shift.title}
          </h3>
          <p className="text-xs text-[#5A5A5A] mt-1">
            Crediting hours here is what a service letter is built from. Only mark
            someone as attended if they were there.
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-xs font-bold uppercase tracking-wider text-[#5A5A5A] hover:text-[#2A2A2A] cursor-pointer"
        >
          Close
        </button>
      </div>

      {!shiftHasEnded && (
        <div className="flex items-start gap-2 bg-[#5B6346]/10 border border-[#5B6346]/30 rounded-xl px-4 py-3 text-xs text-[#5B6346]">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>This shift has not finished yet. Hours dated in the future are refused.</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-[#A64D32]/10 border border-[#A64D32]/30 rounded-xl px-4 py-3 text-xs text-[#A64D32]">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-[#5A5A5A]">Loading roster...</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-[#5A5A5A]">
          Nobody has claimed this shift yet. Hours worked outside the schedule can be
          added to a volunteer's log directly.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {entries.map((entry) => {
              const decision = decisions[entry.userId];
              return (
                <div
                  key={entry.signupId}
                  className="bg-[#FDFBF7] border border-[#E5E0D8] rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="min-w-[12rem]">
                    <div className="font-bold text-sm">{entry.fullName}</div>
                    <div className="text-[11px] text-[#5A5A5A]">
                      {entry.loggedHours === null
                        ? 'Not yet credited'
                        : `Credited ${entry.loggedHours} hrs`}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAttendance(entry.userId, 'attended')}
                      className={`${pill} ${
                        decision?.attendance === 'attended'
                          ? 'bg-[#5B6346] text-white'
                          : 'bg-white border border-[#E5E0D8] text-[#5A5A5A] hover:bg-[#F4F1ED]'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      Attended
                    </button>
                    <button
                      type="button"
                      onClick={() => setAttendance(entry.userId, 'no_show')}
                      className={`${pill} ${
                        decision?.attendance === 'no_show'
                          ? 'bg-[#A64D32] text-white'
                          : 'bg-white border border-[#E5E0D8] text-[#5A5A5A] hover:bg-[#F4F1ED]'
                      }`}
                    >
                      <X className="w-3.5 h-3.5" />
                      No-show
                    </button>

                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      max="24"
                      aria-label={`Hours credited to ${entry.fullName}`}
                      disabled={decision?.attendance !== 'attended'}
                      value={decision?.hours ?? ''}
                      onChange={(e) => setHours(entry.userId, e.target.value)}
                      className="w-20 bg-white border border-[#E5E0D8] rounded-xl px-3 py-1.5 text-sm disabled:opacity-40 focus:outline-none focus:border-[#A64D32]"
                    />
                    <span className="text-[11px] text-[#5A5A5A]">hrs</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-end gap-4 pt-2">
            <div>
              <label className="block text-xs font-bold uppercase tracking-[0.2em] text-[#5A5A5A] mb-1">
                Served on
              </label>
              <input
                type="date"
                value={servedOn}
                onChange={(e) => setServedOn(e.target.value)}
                className="bg-[#FDFBF7] border border-[#E5E0D8] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#A64D32]"
              />
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="bg-[#A64D32] hover:bg-[#8b3f28] text-white px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Credit hours'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};
