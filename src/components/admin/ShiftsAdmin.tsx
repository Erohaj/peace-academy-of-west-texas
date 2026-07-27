import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Pencil, AlertCircle, Eye, EyeOff, Users } from 'lucide-react';
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

  const field =
    'w-full bg-[#FDFBF7] border border-[#E5E0D8] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#A64D32]';
  const label = 'block text-xs font-bold uppercase tracking-[0.2em] text-[#5A5A5A] mb-1';

  return (
    <div className="space-y-6">

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-serif font-bold">Volunteer shifts</h2>
        <button
          onClick={startCreate}
          className="flex items-center gap-2 bg-[#A64D32] hover:bg-[#8b3f28] text-white px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New shift</span>
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-[#A64D32]/10 border border-[#A64D32]/30 rounded-2xl px-4 py-3 text-xs text-[#A64D32]">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {editingId && (
        <form onSubmit={handleSave} className="bg-[#F4F1ED] border border-[#E5E0D8] rounded-2xl p-6 space-y-4">
          <h3 className="font-serif font-bold text-lg">
            {editingId === 'new' ? 'New shift' : 'Edit shift'}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>Title (English) *</label>
              <input required className={field} value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label className={label}>Título (Español) *</label>
              <input required className={field} value={form.title_es}
                onChange={(e) => setForm({ ...form, title_es: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>What they will do (English) *</label>
              <textarea required rows={3} className={field} value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <label className={label}>Descripción (Español) *</label>
              <textarea required rows={3} className={field} value={form.description_es}
                onChange={(e) => setForm({ ...form, description_es: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={label}>Role</label>
              <select
                className={field}
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as VolunteerRoleRow })}
              >
                {VOLUNTEER_ROLES.map(({ value }) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
              <p className="text-[11px] text-[#5A5A5A] mt-1.5">
                Shown in Spanish as “{roleLabelEs(form.role)}”.
              </p>
            </div>
            <div>
              <label className={label}>Spots *</label>
              <input required type="number" min={1} className={field} value={form.spots_total}
                onChange={(e) => setForm({ ...form, spots_total: Number(e.target.value) })} />
              {editingRow && editingRow.spots_filled > 0 && (
                <p className="text-[11px] text-[#5A5A5A] mt-1.5">
                  {editingRow.spots_filled} already claimed.
                </p>
              )}
            </div>
            <div className="flex items-end pb-2.5">
              <label className="flex items-center gap-2 text-xs font-bold text-[#5A5A5A] cursor-pointer">
                <input type="checkbox" checked={form.published}
                  onChange={(e) => setForm({ ...form, published: e.target.checked })} />
                Published
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>Starts (Central Time) *</label>
              <input required type="datetime-local" className={field} value={form.starts_at}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })} />
            </div>
            <div>
              <label className={label}>Ends (Central Time) *</label>
              <input required type="datetime-local" className={field} value={form.ends_at}
                onChange={(e) => setForm({ ...form, ends_at: e.target.value })} />
              <p className="text-[11px] text-[#5A5A5A] mt-1.5">
                {previewHours === null
                  ? 'Volunteers see the length of the shift here.'
                  : `Counts as ${previewHours} hours of service.`}
              </p>
            </div>
          </div>

          <div>
            <label className={label}>Part of an event</label>
            <select className={field} value={form.event_id}
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
              className="bg-[#A64D32] hover:bg-[#8b3f28] text-white px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save shift'}
            </button>
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="border border-[#E5E0D8] hover:bg-[#FDFBF7] px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <p className="text-sm text-[#5A5A5A]">Loading shifts...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[#5A5A5A]">
          No shifts yet. Volunteers see an empty portal until you open one.
        </p>
      ) : (
        <div className="bg-[#F4F1ED] border border-[#E5E0D8] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#FDFBF7] text-xs uppercase tracking-wider text-[#5A5A5A]">
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
                  <tr key={row.id} className="border-t border-[#E5E0D8]">
                    <td className="p-4">
                      <div className="font-bold">{row.title}</div>
                      <div className="text-xs text-[#5A5A5A]">{row.role}</div>
                      {!row.published && (
                        <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wider bg-[#5A5A5A]/15 text-[#5A5A5A] px-2 py-0.5 rounded-full">
                          Draft
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-xs text-[#5A5A5A] whitespace-nowrap">
                      {new Date(row.starts_at).toLocaleString('en-US', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                        timeZone: EVENT_TIME_ZONE
                      })}
                    </td>
                    <td className="p-4 text-xs whitespace-nowrap">{Number(row.duration_hours)}</td>
                    <td className="p-4 text-xs whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-[#5A5A5A]" />
                        {row.spots_filled} / {row.spots_total}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => togglePublished(row)}
                          title={row.published ? 'Unpublish' : 'Publish'}
                          className="p-2 rounded-lg hover:bg-[#FDFBF7] text-[#5A5A5A] cursor-pointer"
                        >
                          {row.published ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => startEdit(row)}
                          title="Edit"
                          className="p-2 rounded-lg hover:bg-[#FDFBF7] text-[#5A5A5A] cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(row)}
                          title="Delete"
                          className="p-2 rounded-lg hover:bg-[#A64D32]/10 text-[#A64D32] cursor-pointer"
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
