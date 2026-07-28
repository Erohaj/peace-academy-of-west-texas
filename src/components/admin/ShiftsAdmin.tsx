import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Pencil, AlertCircle, Eye, EyeOff, Users, ClipboardCheck } from 'lucide-react';
import { ShiftRoster } from './ShiftRoster';
import type { Tables, VolunteerRoleRow } from '../../lib/database.types';
import { fetchAllShiftsForAdmin } from '../../lib/api/shifts';
import { fetchAllEventsForAdmin } from '../../lib/api/events';
import { createShift, deleteShift, updateShift } from '../../lib/api/admin';
import { useAppStore } from '../../store/useAppStore';
import { VOLUNTEER_ROLES, roleLabelEs } from '../../data/volunteerRoles';
import { EVENT_TIME_ZONE, instantToWallClock, wallClockToInstant } from '../../lib/formatEventDate';

type ShiftRow = Tables<'shifts'>;
type EventRow = Tables<'events'>;

interface ShiftForm {
  title: string;
  title_es: string;
  description: string;
  description_es: string;
  role: VolunteerRoleRow;
  starts_at: string;
  ends_at: string;
  spots_total: number;
  event_id: string;
  published: boolean;
}

const BLANK_FORM: ShiftForm = {
  title: '',
  title_es: '',
  description: '',
  description_es: '',
  role: 'General Support',
  starts_at: '',
  ends_at: '',
  spots_total: 5,
  event_id: '',
  published: true
};

/** Same wall-clock handling as EventsAdmin: admins type venue time, not theirs. */
const toIso = (value: string): string | null => wallClockToInstant(value)?.toISOString() ?? null;

/**
 * Volunteer shift management.
 *
 * Until this existed, shifts could only reach the database through seed.sql or
 * the SQL editor — the volunteer portal listed whatever someone had inserted by
 * hand, and there was no way for staff to open a new one.
 */
export const ShiftsAdmin: React.FC = () => {
  const refreshContent = useAppStore((state) => state.refreshContent);

  const [rows, setRows] = useState<ShiftRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ShiftForm>(BLANK_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [rosterShiftId, setRosterShiftId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Events are only needed to populate the "part of" dropdown, so a failure
      // there must not cost the admin the shift list itself.
      const [shiftRows, eventRows] = await Promise.all([
        fetchAllShiftsForAdmin(),
        fetchAllEventsForAdmin().catch(() => [] as EventRow[])
      ]);
      setRows(shiftRows);
      setEvents(eventRows);
    } catch (loadError) {
      console.error('[PAWTX] Failed to load shifts for admin', loadError);
      setError('Could not load shifts.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const editingRow = editingId && editingId !== 'new' ? rows.find((r) => r.id === editingId) : null;
  const rosterShift = rosterShiftId ? rows.find((r) => r.id === rosterShiftId) : null;

  /**
   * What the volunteer will see as the shift length. The database computes it
   * as a generated column from the two timestamps; showing it live means an
   * admin notices a 14-hour shift caused by a stray date before saving.
   */
  const previewHours = useMemo(() => {
    const start = wallClockToInstant(form.starts_at);
    const end = wallClockToInstant(form.ends_at);
    if (!start || !end) return null;
    const hours = (end.getTime() - start.getTime()) / 3_600_000;
    return hours > 0 ? Math.round(hours * 10) / 10 : null;
  }, [form.starts_at, form.ends_at]);

  const startCreate = () => {
    setEditingId('new');
    setForm(BLANK_FORM);
    setError(null);
  };

  const startEdit = (row: ShiftRow) => {
    setEditingId(row.id);
    setError(null);
    setForm({
      title: row.title,
      title_es: row.title_es,
      description: row.description,
      description_es: row.description_es,
      role: row.role,
      starts_at: instantToWallClock(row.starts_at),
      ends_at: instantToWallClock(row.ends_at),
      spots_total: row.spots_total,
      event_id: row.event_id ?? '',
      published: row.published
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const startsAt = toIso(form.starts_at);
    const endsAt = toIso(form.ends_at);

    // Each of these is also a CHECK constraint. Catching them here turns a
    // Postgres error string into something an admin can act on.
    if (!startsAt || !endsAt) {
      setError('A start and an end time are both required.');
      return;
    }
    if (new Date(endsAt) <= new Date(startsAt)) {
      setError('The shift has to end after it starts.');
      return;
    }
    if (form.spots_total < 1) {
      setError('A shift needs at least one spot.');
      return;
    }
    if (editingRow && form.spots_total < editingRow.spots_filled) {
      setError(
        `${editingRow.spots_filled} volunteer(s) have already claimed this shift, so it cannot be cut to ${form.spots_total}. Remove them from the roster first.`
      );
      return;
    }

    setIsSaving(true);
    setError(null);

    const payload = {
      title: form.title,
      title_es: form.title_es,
      description: form.description,
      description_es: form.description_es,
      role: form.role,
      // Never typed by hand — see src/data/volunteerRoles.ts.
      role_es: roleLabelEs(form.role),
      starts_at: startsAt,
      ends_at: endsAt,
      spots_total: Number(form.spots_total),
      // '' is the "not part of an event" option; the column is nullable.
      event_id: form.event_id || null,
      published: form.published
    };

    try {
      if (editingId === 'new') {
        await createShift(payload);
      } else if (editingId) {
        await updateShift(editingId, payload);
      }
      setEditingId(null);
      await load();
      // The volunteer portal reads shifts from the store, not from here.
      await refreshContent();
    } catch (saveError) {
      console.error('[PAWTX] Failed to save shift', saveError);
      setError('Could not save this shift. Check the fields and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (row: ShiftRow) => {
    const confirmed = window.confirm(
      row.spots_filled > 0
        ? `Delete "${row.title}"?\n\n${row.spots_filled} volunteer(s) have claimed this shift and will lose their place without being told. Consider unpublishing instead.`
        : `Delete "${row.title}"?`
    );
    if (!confirmed) return;

    try {
      await deleteShift(row.id);
      await load();
      await refreshContent();
    } catch (deleteError) {
      console.error('[PAWTX] Failed to delete shift', deleteError);
      setError('Could not delete this shift.');
    }
  };

  const togglePublished = async (row: ShiftRow) => {
    try {
      await updateShift(row.id, { published: !row.published });
      await load();
      await refreshContent();
    } catch (toggleError) {
      console.error('[PAWTX] Failed to change shift visibility', toggleError);
      setError('Could not change visibility.');
    }
  };

  return (
    <div className="space-y-6">

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-serif font-bold">Volunteer shifts</h2>
        <button
          onClick={startCreate}
          className="flex items-center gap-2 bg-terracotta hover:bg-terracotta-deep text-white px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New shift</span>
        </button>
      </div>

      {error && (
        <div className="pawtx-callout">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {editingId && (
        <form onSubmit={handleSave} className="pawtx-card">
          <h3 className="font-serif font-bold text-lg">
            {editingId === 'new' ? 'New shift' : 'Edit shift'}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="pawtx-label">Title (English) *</label>
              <input required className="pawtx-field" value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label className="pawtx-label">Título (Español) *</label>
              <input required className="pawtx-field" value={form.title_es}
                onChange={(e) => setForm({ ...form, title_es: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="pawtx-label">What they will do (English) *</label>
              <textarea required rows={3} className="pawtx-field" value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <label className="pawtx-label">Descripción (Español) *</label>
              <textarea required rows={3} className="pawtx-field" value={form.description_es}
                onChange={(e) => setForm({ ...form, description_es: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="pawtx-label">Role</label>
              <select
                className="pawtx-field"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as VolunteerRoleRow })}
              >
                {VOLUNTEER_ROLES.map(({ value }) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
              <p className="text-[11px] text-charcoal mt-1.5">
                Shown in Spanish as “{roleLabelEs(form.role)}”.
              </p>
            </div>
            <div>
              <label className="pawtx-label">Spots *</label>
              <input required type="number" min={1} className="pawtx-field" value={form.spots_total}
                onChange={(e) => setForm({ ...form, spots_total: Number(e.target.value) })} />
              {editingRow && editingRow.spots_filled > 0 && (
                <p className="text-[11px] text-charcoal mt-1.5">
                  {editingRow.spots_filled} already claimed.
                </p>
              )}
            </div>
            <div className="flex items-end pb-2.5">
              <label className="flex items-center gap-2 text-xs font-bold text-charcoal cursor-pointer">
                <input type="checkbox" checked={form.published}
                  onChange={(e) => setForm({ ...form, published: e.target.checked })} />
                Published
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="pawtx-label">Starts (Central Time) *</label>
              <input required type="datetime-local" className="pawtx-field" value={form.starts_at}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })} />
            </div>
            <div>
              <label className="pawtx-label">Ends (Central Time) *</label>
              <input required type="datetime-local" className="pawtx-field" value={form.ends_at}
                onChange={(e) => setForm({ ...form, ends_at: e.target.value })} />
              <p className="text-[11px] text-charcoal mt-1.5">
                {previewHours === null
                  ? 'Volunteers see the length of the shift here.'
                  : `Counts as ${previewHours} hours of service.`}
              </p>
            </div>
          </div>

          <div>
            <label className="pawtx-label">Part of an event</label>
            <select className="pawtx-field" value={form.event_id}
              onChange={(e) => setForm({ ...form, event_id: e.target.value })}>
              <option value="">Standalone — not tied to an event</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>{event.title}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="pawtx-cta"
            >
              {isSaving ? 'Saving...' : 'Save shift'}
            </button>
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="pawtx-cta-outline"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {rosterShift && (
        <ShiftRoster
          shift={rosterShift}
          onClose={() => setRosterShiftId(null)}
          // Credited hours change nothing in this table, but the volunteer
          // portal reads its totals from the same ledger.
          onSaved={() => void refreshContent()}
        />
      )}

      {isLoading ? (
        <p className="text-sm text-charcoal">Loading shifts...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-charcoal">
          No shifts yet. Volunteers see an empty portal until you open one.
        </p>
      ) : (
        <div className="bg-aged-paper border border-warm-taupe rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-parchment text-xs uppercase tracking-wider text-charcoal">
                <tr>
                  <th className="text-left p-4">Shift</th>
                  <th className="text-left p-4">Starts</th>
                  <th className="text-left p-4">Hours</th>
                  <th className="text-left p-4">Filled</th>
                  <th className="text-right p-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-warm-taupe">
                    <td className="p-4">
                      <div className="font-bold">{row.title}</div>
                      <div className="text-xs text-charcoal">{row.role}</div>
                      {!row.published && (
                        <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wider bg-charcoal/15 text-charcoal px-2 py-0.5 rounded-full">
                          Draft
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-xs text-charcoal whitespace-nowrap">
                      {new Date(row.starts_at).toLocaleString('en-US', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                        timeZone: EVENT_TIME_ZONE
                      })}
                    </td>
                    <td className="p-4 text-xs whitespace-nowrap">{Number(row.duration_hours)}</td>
                    <td className="p-4 text-xs whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-charcoal" />
                        {row.spots_filled} / {row.spots_total}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setRosterShiftId(rosterShiftId === row.id ? null : row.id)}
                          title="Roster and hours"
                          className="pawtx-icon-btn"
                        >
                          <ClipboardCheck className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => togglePublished(row)}
                          title={row.published ? 'Unpublish' : 'Publish'}
                          className="pawtx-icon-btn"
                        >
                          {row.published ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => startEdit(row)}
                          title="Edit"
                          className="pawtx-icon-btn"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(row)}
                          title="Delete"
                          className="pawtx-icon-btn-accent"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
