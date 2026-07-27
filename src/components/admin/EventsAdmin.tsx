import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, Upload, AlertCircle, Eye, EyeOff } from 'lucide-react';
import type { Tables } from '../../lib/database.types';
import { fetchAllEventsForAdmin } from '../../lib/api/events';
import { createEvent, deleteEvent, updateEvent, uploadMedia } from '../../lib/api/admin';
import { useAppStore } from '../../store/useAppStore';
import { resolveImage } from '../../lib/api/images';
import { EVENT_TIME_ZONE, instantToWallClock, wallClockToInstant } from '../../lib/formatEventDate';

type EventRow = Tables<'events'>;

interface EventForm {
  title: string;
  title_es: string;
  description: string;
  description_es: string;
  starts_at: string;
  ends_at: string;
  location: string;
  category: EventRow['category'];
  total_spots: number;
  image_url: string | null;
  image_key: string | null;
  featured: boolean;
  published: boolean;
}

const BLANK_FORM: EventForm = {
  title: '',
  title_es: '',
  description: '',
  description_es: '',
  starts_at: '',
  ends_at: '',
  location: '',
  category: 'cultural',
  total_spots: 25,
  image_url: null,
  image_key: null,
  featured: false,
  published: true
};

/**
 * `datetime-local` inputs speak naive wall-clock time with no zone, while the
 * database stores timestamptz. The helpers in formatEventDate.ts pin that wall
 * clock to Central Time — the zone PAWTX runs in — so an admin typing "6:30 PM"
 * gets 6:30 PM at the venue regardless of their own laptop's timezone.
 */
const toLocalInputValue = (iso: string | null): string => instantToWallClock(iso);

function toIsoFromLocalInput(value: string): string | null {
  return wallClockToInstant(value)?.toISOString() ?? null;
}

export const EventsAdmin: React.FC = () => {
  const refreshContent = useAppStore((state) => state.refreshContent);

  const [rows, setRows] = useState<EventRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EventForm>(BLANK_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setRows(await fetchAllEventsForAdmin());
    } catch (loadError) {
      console.error('[PAWTX] Failed to load events for admin', loadError);
      setError('Could not load events.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startCreate = () => {
    setEditingId('new');
    setForm(BLANK_FORM);
  };

  const startEdit = (row: EventRow) => {
    setEditingId(row.id);
    setForm({
      title: row.title,
      title_es: row.title_es,
      description: row.description,
      description_es: row.description_es,
      starts_at: toLocalInputValue(row.starts_at),
      ends_at: toLocalInputValue(row.ends_at),
      location: row.location,
      category: row.category,
      total_spots: row.total_spots,
      image_url: row.image_url,
      image_key: row.image_key,
      featured: row.featured,
      published: row.published
    });
  };

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    setError(null);
    try {
      const url = await uploadMedia(file, 'events');
      setForm((current) => ({ ...current, image_url: url }));
    } catch (uploadError) {
      console.error('[PAWTX] Photo upload failed', uploadError);
      setError('Could not upload that photo.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const startsAt = toIsoFromLocalInput(form.starts_at);
    if (!startsAt) {
      setError('A start date and time is required.');
      return;
    }

    setIsSaving(true);
    setError(null);

    const payload = {
      title: form.title,
      title_es: form.title_es,
      description: form.description,
      description_es: form.description_es,
      starts_at: startsAt,
      ends_at: toIsoFromLocalInput(form.ends_at),
      location: form.location,
      category: form.category,
      total_spots: Number(form.total_spots),
      image_url: form.image_url,
      image_key: form.image_key,
      featured: form.featured,
      published: form.published
    };

    try {
      if (editingId === 'new') {
        await createEvent(payload);
      } else if (editingId) {
        await updateEvent(editingId, payload);
      }
      setEditingId(null);
      await load();
      // Push the change to the public pages without a reload.
      await refreshContent();
    } catch (saveError) {
      console.error('[PAWTX] Failed to save event', saveError);
      setError('Could not save this event. Check the required fields and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (row: EventRow) => {
    // Deleting an event cascades to its RSVPs, which is not recoverable from
    // the panel — make the consequence explicit before it happens.
    const confirmed = window.confirm(
      `Delete "${row.title}"?\n\nThis also permanently removes every RSVP for it (${row.reserved_spots} seats currently reserved). Consider unpublishing instead.`
    );
    if (!confirmed) return;

    try {
      await deleteEvent(row.id);
      await load();
      await refreshContent();
    } catch (deleteError) {
      console.error('[PAWTX] Failed to delete event', deleteError);
      setError('Could not delete this event.');
    }
  };

  const togglePublished = async (row: EventRow) => {
    try {
      await updateEvent(row.id, { published: !row.published });
      await load();
      await refreshContent();
    } catch (toggleError) {
      console.error('[PAWTX] Failed to change event visibility', toggleError);
      setError('Could not change visibility.');
    }
  };

  const field = 'w-full bg-[#FDFBF7] border border-[#E5E0D8] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#A64D32]';
  const label = 'block text-xs font-bold uppercase tracking-[0.2em] text-[#5A5A5A] mb-1';

  return (
    <div className="space-y-6">

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-serif font-bold">Events</h2>
        <button
          onClick={startCreate}
          className="flex items-center gap-2 bg-[#A64D32] hover:bg-[#8b3f28] text-white px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Event</span>
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
            {editingId === 'new' ? 'New event' : 'Edit event'}
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
              <label className={label}>Description (English) *</label>
              <textarea required rows={3} className={field} value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <label className={label}>Descripción (Español) *</label>
              <textarea required rows={3} className={field} value={form.description_es}
                onChange={(e) => setForm({ ...form, description_es: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>Starts (Central Time) *</label>
              <input required type="datetime-local" className={field} value={form.starts_at}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })} />
            </div>
            <div>
              <label className={label}>Ends (Central Time)</label>
              <input type="datetime-local" className={field} value={form.ends_at}
                onChange={(e) => setForm({ ...form, ends_at: e.target.value })} />
            </div>
          </div>

          <div>
            <label className={label}>Location *</label>
            <input required className={field} value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={label}>Category</label>
              <select className={field} value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as EventRow['category'] })}>
                <option value="cooking">Cooking</option>
                <option value="cultural">Cultural</option>
                <option value="seminars">Seminars</option>
                <option value="relief">Relief</option>
              </select>
            </div>
            <div>
              <label className={label}>Total spots *</label>
              <input required type="number" min={0} className={field} value={form.total_spots}
                onChange={(e) => setForm({ ...form, total_spots: Number(e.target.value) })} />
            </div>
            <div className="flex items-end gap-4 pb-2.5">
              <label className="flex items-center gap-2 text-xs font-bold text-[#5A5A5A] cursor-pointer">
                <input type="checkbox" checked={form.featured}
                  onChange={(e) => setForm({ ...form, featured: e.target.checked })} />
                Featured
              </label>
              <label className="flex items-center gap-2 text-xs font-bold text-[#5A5A5A] cursor-pointer">
                <input type="checkbox" checked={form.published}
                  onChange={(e) => setForm({ ...form, published: e.target.checked })} />
                Published
              </label>
            </div>
          </div>

          <div>
            <label className={label}>Photo</label>
            <div className="flex items-center gap-4">
              {(form.image_url || form.image_key) && (
                <img
                  src={resolveImage(form.image_key, form.image_url)}
                  alt=""
                  className="w-24 h-16 object-cover rounded-xl border border-[#E5E0D8]"
                />
              )}
              <label className="flex items-center gap-2 border border-[#E5E0D8] bg-[#FDFBF7] hover:bg-white px-4 py-2.5 rounded-xl text-xs font-bold cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>{isUploading ? 'Uploading...' : 'Upload photo'}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={isUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleUpload(file);
                  }}
                />
              </label>
            </div>
            <p className="text-[11px] text-[#5A5A5A] mt-1.5">
              Photos are resized to 1600px and converted to WebP in your browser before upload.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSaving || isUploading}
              className="bg-[#A64D32] hover:bg-[#8b3f28] text-white px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save event'}
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
        <p className="text-sm text-[#5A5A5A]">Loading events...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[#5A5A5A]">No events yet.</p>
      ) : (
        <div className="bg-[#F4F1ED] border border-[#E5E0D8] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#FDFBF7] text-xs uppercase tracking-wider text-[#5A5A5A]">
                <tr>
                  <th className="text-left p-4">Event</th>
                  <th className="text-left p-4">Starts</th>
                  <th className="text-left p-4">Seats</th>
                  <th className="text-right p-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-[#E5E0D8]">
                    <td className="p-4">
                      <div className="font-bold">{row.title}</div>
                      <div className="text-xs text-[#5A5A5A]">{row.location}</div>
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
                    <td className="p-4 text-xs whitespace-nowrap">
                      {row.reserved_spots} / {row.total_spots}
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
