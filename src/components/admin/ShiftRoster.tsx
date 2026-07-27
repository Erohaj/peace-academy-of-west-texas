import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, X, ClipboardCheck } from 'lucide-react';
import type { AttendanceRow, Tables } from '../../lib/database.types';
import {
  closeRoster,
  fetchRoster,
  type RosterDecision,
  type RosterEntry
} from '../../lib/api/serviceLog';
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
  // Named on the confirmation step: verified_by is stamped with this account,
  // so whoever is about to sign the hours off should see whose name it is.
  const volunteerName = useAppStore((state) => state.volunteer?.fullName ?? 'you');

  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [servedOn, setServedOn] = useState(() => instantToWallClock(shift.starts_at).slice(0, 10));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set once the roster passes validation, cleared when anything changes. */
  const [pending, setPending] = useState<RosterDecision[] | null>(null);
  const [justSaved, setJustSaved] = useState<string | null>(null);

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

  // Any edit invalidates a pending confirmation — otherwise the summary could
  // describe one roster while a different one is what gets written.
  const discardReview = () => {
    setPending(null);
    setJustSaved(null);
  };

  const setAttendance = (userId: string, attendance: AttendanceRow) => {
    discardReview();
    setDecisions((current) => ({
      ...current,
      [userId]: { ...current[userId], attendance }
    }));
  };

  const setHours = (userId: string, hours: string) => {
    discardReview();
    setDecisions((current) => ({
      ...current,
      [userId]: { ...current[userId], hours }
    }));
  };

  /**
   * First step: check the roster and show what is about to happen.
   *
   * Crediting hours is what a service letter is later built from, and a
   * no-show removes hours already credited. Neither should follow from a
   * single click on a screen where the buttons sit next to a number field.
   */
  const handleReview = () => {
    setJustSaved(null);

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

    setError(null);
    setPending(
      marked.map((row) => ({
        userId: row.entry.userId,
        attendance: row.decision.attendance as AttendanceRow,
        hours: Number(row.decision.hours)
      }))
    );
  };

  const handleConfirm = async () => {
    if (!pending || !adminId) return;

    setIsSaving(true);
    setError(null);
    try {
      await closeRoster(shift.id, servedOn, pending, adminId);
      const credited = pending.filter((d) => d.attendance === 'attended');
      const hours = credited.reduce((sum, d) => sum + d.hours, 0);
      setPending(null);
      setJustSaved(
        credited.length === 0
          ? 'Saved. No hours credited — everyone was marked as a no-show.'
          : `Credited ${Math.round(hours * 10) / 10} hours to ${credited.length} volunteer(s).`
      );
      await load();
      onSaved();
    } catch (saveError) {
      console.error('[PAWTX] Failed to close roster', saveError);
      // Show what the database actually said. The previous version asserted a
      // cause it had not checked — "the date must be in the future" — which
      // sent staff looking at a correct date while the real fault was an
      // unusable index.
      const detail =
        saveError && typeof saveError === 'object' && 'message' in saveError
          ? String((saveError as { message?: unknown }).message ?? '')
          : '';
      setError(detail ? `Could not save the roster: ${detail}` : 'Could not save the roster.');
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
                onChange={(e) => {
                  discardReview();
                  setServedOn(e.target.value);
                }}
                className="bg-[#FDFBF7] border border-[#E5E0D8] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#A64D32]"
              />
            </div>

            {!pending && (
              <button
                type="button"
                onClick={handleReview}
                className="bg-[#A64D32] hover:bg-[#8b3f28] text-white px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                Review and credit
              </button>
            )}
          </div>

          {justSaved && (
            <div className="flex items-start gap-2 bg-[#5B6346]/10 border border-[#5B6346]/30 rounded-xl px-4 py-3 text-xs text-[#5B6346]">
              <Check className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {justSaved} Volunteers see this on the Hours Log &amp; Badges tab of their
                portal.
              </span>
            </div>
          )}

          {/* The confirmation step. It spells out the totals rather than
              asking "are you sure?", because the thing worth checking is
              whether these are the right people and the right hours. */}
          {pending && (
            <div className="bg-[#FDFBF7] border border-[#A64D32]/40 rounded-2xl p-5 space-y-3">
              <div className="text-sm font-bold text-[#2A2A2A]">Confirm before crediting</div>

              <ul className="text-xs text-[#5A5A5A] space-y-1">
                {pending.map((decision) => {
                  const name =
                    entries.find((e) => e.userId === decision.userId)?.fullName ?? decision.userId;
                  const previously = entries.find((e) => e.userId === decision.userId)?.loggedHours;
                  return (
                    <li key={decision.userId} className="flex items-center justify-between gap-4">
                      <span className="truncate">{name}</span>
                      <span className="font-bold whitespace-nowrap">
                        {decision.attendance === 'attended'
                          ? `${decision.hours} hrs`
                          : previously === null || previously === undefined
                            ? 'no-show'
                            : `no-show — removes ${previously} hrs`}
                      </span>
                    </li>
                  );
                })}
              </ul>

              <p className="text-[11px] text-[#5A5A5A]">
                Dated{' '}
                {new Date(`${servedOn}T12:00:00`).toLocaleDateString('en-US', {
                  dateStyle: 'long'
                })}
                , signed off as {volunteerName}.
              </p>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isSaving}
                  className="bg-[#A64D32] hover:bg-[#8b3f28] text-white px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Confirm and credit'}
                </button>
                <button
                  type="button"
                  onClick={() => setPending(null)}
                  disabled={isSaving}
                  className="border border-[#E5E0D8] hover:bg-white px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
