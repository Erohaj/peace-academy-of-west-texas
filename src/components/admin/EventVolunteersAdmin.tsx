import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Download, HandHeart, Link2, Trash2, X } from 'lucide-react';
import type { AttendanceRow, Tables } from '../../lib/database.types';
import { fetchAllEventsForAdmin } from '../../lib/api/events';
import { downloadCsv, toCsv } from '../../lib/api/admin';
import {
  deleteEventVolunteer,
  fetchEventVolunteers,
  setEventVolunteerAttendance,
  type EventVolunteerEntry
} from '../../lib/api/eventVolunteers';
import { EVENT_TIME_ZONE } from '../../lib/formatEventDate';
import { VOLUNTEER_PARAM } from '../../lib/eventShare';

type EventRow = Tables<'events'>;

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: EVENT_TIME_ZONE
  });

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {
    dateStyle: 'medium',
    timeZone: EVENT_TIME_ZONE
  });

/**
 * The recruitment link for one event, built without a PAWTXEvent in hand.
 *
 * `volunteerShareUrl` takes the mapped domain event; this screen holds raw
 * admin rows, which include the unpublished and finished events it exists to
 * let staff look at. Same parameter name either way, from the same constant.
 */
function volunteerLinkFor(eventId: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set(VOLUNTEER_PARAM, eventId);
  return url.toString();
}

/**
 * Who signed up to help at an event without an account.
 *
 * Deliberately a screen of its own rather than a section of ShiftRoster. The
 * roster's job is to close a shift and credit hours, and nothing here can be
 * credited — there is no profile to credit, which is the trade the no-account
 * form makes. Putting these names in that screen would put an "award hours"
 * button next to people it cannot award hours to.
 *
 * What it is instead is the list somebody prints on the morning of the event:
 * who said they were coming, what they said about it, and a phone number for
 * when they do not turn up.
 */
export const EventVolunteersAdmin: React.FC = () => {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventId, setEventId] = useState('');
  const [entries, setEntries] = useState<EventVolunteerEntry[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /** Set by the first click on a remove button, cleared by anything else. */
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const rows = await fetchAllEventsForAdmin();
        if (cancelled) return;
        setEvents(rows);
        // Newest first out of fetchAllEventsForAdmin, which for this screen is
        // usually the one being staffed.
        setEventId((current) => current || rows[0]?.id || '');
      } catch (loadError) {
        console.error('[PAWTX] Failed to load events', loadError);
        if (!cancelled) setError('Could not load the event list.');
      } finally {
        if (!cancelled) setIsLoadingEvents(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadVolunteers = useCallback(async () => {
    if (!eventId) {
      setEntries([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      setEntries(await fetchEventVolunteers(eventId));
    } catch (loadError) {
      console.error('[PAWTX] Failed to load event volunteers', loadError);
      setError('Could not load who signed up for this event.');
    } finally {
      setIsLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void loadVolunteers();
  }, [loadVolunteers]);

  const selectedEvent = events.find((row) => row.id === eventId);

  // Grouped for reading, not for querying: one request brought the whole event
  // back, and a shift lead reads a roster one shift at a time.
  const byShift = useMemo(() => {
    const groups = new Map<string, { title: string; startsAt: string; rows: EventVolunteerEntry[] }>();

    for (const entry of entries) {
      const group = groups.get(entry.shiftId);
      if (group) group.rows.push(entry);
      else {
        groups.set(entry.shiftId, {
          title: entry.shiftTitle,
          startsAt: entry.shiftStartsAt,
          rows: [entry]
        });
      }
    }

    return [...groups.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }, [entries]);

  const updateAttendance = async (id: string, attendance: AttendanceRow | null) => {
    setBusyId(id);
    setError(null);
    setConfirmRemoveId(null);
    try {
      await setEventVolunteerAttendance(id, attendance);
      setEntries((current) =>
        current.map((entry) => (entry.id === id ? { ...entry, attendance } : entry))
      );
    } catch (saveError) {
      console.error('[PAWTX] Failed to save attendance', saveError);
      setError('Could not save that. Your session may have expired — sign in again.');
    } finally {
      setBusyId(null);
    }
  };

  const removeSignup = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await deleteEventVolunteer(id);
      setEntries((current) => current.filter((entry) => entry.id !== id));
      setConfirmRemoveId(null);
    } catch (removeError) {
      console.error('[PAWTX] Failed to remove a signup', removeError);
      setError('Could not remove that signup.');
    } finally {
      setBusyId(null);
    }
  };

  const copyLink = async () => {
    if (!eventId) return;
    try {
      await navigator.clipboard.writeText(volunteerLinkFor(eventId));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // `navigator.clipboard` is undefined outside a secure context and reading
      // `.writeText` off it throws rather than rejecting, which is why this is
      // a try/catch. The input below holds the link either way, selectable.
      setError('Could not copy. Select the link above and copy it by hand.');
    }
  };

  const exportCsv = () => {
    const rows = entries.map((entry) => ({
      shift: entry.shiftTitle,
      shift_date: entry.shiftStartsAt ? formatDate(entry.shiftStartsAt) : '',
      name: entry.fullName,
      email: entry.email,
      phone: entry.phone ?? '',
      note: entry.note ?? '',
      language: entry.language,
      attendance: entry.attendance ?? '',
      signed_up_at: formatDateTime(entry.createdAt)
    }));

    downloadCsv(
      `pawtx-event-volunteers-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(rows, [
        'shift', 'shift_date', 'name', 'email', 'phone', 'note',
        'language', 'attendance', 'signed_up_at'
      ])
    );
  };

  if (isLoadingEvents) {
    return <p className="text-sm text-charcoal">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-aged-paper rounded-2xl p-6 border border-warm-taupe space-y-4">
        <div className="flex items-start gap-3">
          <HandHeart className="w-5 h-5 text-terracotta mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-serif font-bold text-graphite">Event volunteers</h2>
            <p className="text-xs text-charcoal mt-1 leading-relaxed">
              People who signed up through the public form, without an account. These sign-ups
              record <strong>no service hours</strong> and can never appear on a certificate —
              there is no account to credit. Anyone who needs certified hours has to go through
              the Volunteer Portal, and the signup form tells them so.
            </p>
          </div>
        </div>

        <div>
          <label className="pawtx-label" htmlFor="event-volunteers-event">
            Event
          </label>
          <select
            id="event-volunteers-event"
            value={eventId}
            onChange={(e) => {
              setEventId(e.target.value);
              setConfirmRemoveId(null);
            }}
            className="pawtx-field"
          >
            {events.length === 0 && <option value="">No events yet</option>}
            {events.map((row) => (
              <option key={row.id} value={row.id}>
                {formatDate(row.starts_at)} — {row.title}
                {row.published ? '' : ' (draft)'}
              </option>
            ))}
          </select>
        </div>

        {eventId && (
          <div>
            <label className="pawtx-label" htmlFor="event-volunteers-link">
              Recruitment link — opens the shift list and the signup form
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="event-volunteers-link"
                type="text"
                readOnly
                value={volunteerLinkFor(eventId)}
                onFocus={(e) => e.currentTarget.select()}
                className="pawtx-field flex-1 font-mono text-xs"
              />
              <button
                type="button"
                onClick={copyLink}
                className="shrink-0 py-2.5 px-5 rounded-full font-bold text-xs uppercase tracking-widest text-white bg-graphite hover:bg-black transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            {!selectedEvent?.published && (
              <p className="text-xs font-semibold text-terracotta mt-1">
                This event is a draft, so the link will not open for anyone but staff. Publish it
                before sending the link out.
              </p>
            )}
          </div>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="bg-terracotta/10 border border-terracotta/30 rounded-xl p-3 flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 text-terracotta mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-xs font-semibold text-terracotta">{error}</p>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs font-bold uppercase tracking-wider text-charcoal">
          {isLoading
            ? 'Loading…'
            : `${entries.length} ${entries.length === 1 ? 'person' : 'people'} signed up`}
        </p>
        <button
          type="button"
          onClick={exportCsv}
          disabled={entries.length === 0}
          className="py-2 px-4 rounded-full font-bold text-xs uppercase tracking-widest text-graphite bg-parchment hover:bg-warm-taupe border border-warm-taupe transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Export CSV</span>
        </button>
      </div>

      {!isLoading && entries.length === 0 && (
        <div className="bg-aged-paper rounded-2xl p-6 border border-warm-taupe">
          <p className="text-sm text-charcoal">
            Nobody has signed up through the public form for this event yet. If the event has no
            shifts, create them under <strong>Volunteer Shifts</strong> first — the form lists
            that event&rsquo;s shifts, and with none there is nothing to sign up for.
          </p>
        </div>
      )}

      {byShift.map((group) => (
        <div
          key={group.startsAt + group.title}
          className="bg-aged-paper rounded-2xl border border-warm-taupe overflow-hidden"
        >
          <div className="px-5 py-3 border-b border-warm-taupe flex items-baseline justify-between gap-3 flex-wrap">
            <h3 className="font-serif font-bold text-graphite">{group.title}</h3>
            <span className="text-xs text-charcoal">
              {group.startsAt ? formatDateTime(group.startsAt) : ''} · {group.rows.length} signed up
            </span>
          </div>

          <div className="divide-y divide-warm-taupe">
            {group.rows.map((entry) => {
              const isBusy = busyId === entry.id;

              return (
                <div key={entry.id} className="px-5 py-4 flex flex-col lg:flex-row gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-sm text-graphite">{entry.fullName}</div>
                    <div className="text-xs text-charcoal mt-0.5 break-words">
                      <a href={`mailto:${entry.email}`} className="hover:underline">
                        {entry.email}
                      </a>
                      {entry.phone && (
                        <>
                          {' · '}
                          <a href={`tel:${entry.phone}`} className="hover:underline">
                            {entry.phone}
                          </a>
                        </>
                      )}
                    </div>
                    {entry.note && (
                      <p className="text-xs text-graphite mt-1.5 bg-parchment border border-warm-taupe rounded-lg px-2.5 py-1.5">
                        {entry.note}
                      </p>
                    )}
                    <div className="text-2xs text-muted-text mt-1.5">
                      Signed up {formatDateTime(entry.createdAt)} ·{' '}
                      {entry.language === 'es' ? 'Spanish' : 'English'}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {/* Three states, not a checkbox: "not looked at" has to
                        stay distinguishable from "did not turn up", which is
                        the same reason shift_signups.attendance is nullable. */}
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        updateAttendance(entry.id, entry.attendance === 'attended' ? null : 'attended')
                      }
                      aria-pressed={entry.attendance === 'attended'}
                      className={`py-1.5 px-3 rounded-full text-2xs font-bold uppercase tracking-wider border transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1 ${
                        entry.attendance === 'attended'
                          ? 'bg-olive text-white border-olive'
                          : 'bg-parchment text-graphite border-warm-taupe hover:bg-warm-taupe'
                      }`}
                    >
                      <Check className="w-3 h-3" aria-hidden="true" />
                      <span>Attended</span>
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        updateAttendance(entry.id, entry.attendance === 'no_show' ? null : 'no_show')
                      }
                      aria-pressed={entry.attendance === 'no_show'}
                      className={`py-1.5 px-3 rounded-full text-2xs font-bold uppercase tracking-wider border transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1 ${
                        entry.attendance === 'no_show'
                          ? 'bg-terracotta text-white border-terracotta'
                          : 'bg-parchment text-graphite border-warm-taupe hover:bg-warm-taupe'
                      }`}
                    >
                      <X className="w-3 h-3" aria-hidden="true" />
                      <span>No show</span>
                    </button>

                    {/* Two clicks, because this gives the place back to whoever
                        asks for it next and there is no undo. */}
                    {confirmRemoveId === entry.id ? (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => removeSignup(entry.id)}
                        className="py-1.5 px-3 rounded-full text-2xs font-bold uppercase tracking-wider bg-terracotta text-white border border-terracotta cursor-pointer disabled:opacity-50"
                      >
                        Remove — sure?
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => setConfirmRemoveId(entry.id)}
                        aria-label={`Remove ${entry.fullName} from ${group.title}`}
                        className="p-2 rounded-full text-charcoal hover:bg-terracotta/10 hover:text-terracotta transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
