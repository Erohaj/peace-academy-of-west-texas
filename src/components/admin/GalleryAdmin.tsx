import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, Upload, AlertCircle, Eye, EyeOff } from 'lucide-react';
import type { Tables } from '../../lib/database.types';
import { fetchAllGalleryForAdmin } from '../../lib/api/gallery';
import { createGalleryItem, deleteGalleryItem, updateGalleryItem, uploadMedia } from '../../lib/api/admin';
import { useAppStore } from '../../store/useAppStore';
import { resolveImage } from '../../lib/api/images';

type GalleryRow = Tables<'gallery_items'>;

interface GalleryForm {
  title: string;
  title_es: string;
  caption: string;
  caption_es: string;
  category: GalleryRow['category'];
  taken_on: string;
  location: string;
  image_url: string | null;
  image_key: string | null;
  sort_order: number;
  published: boolean;
}

const BLANK_FORM: GalleryForm = {
  title: '',
  title_es: '',
  caption: '',
  caption_es: '',
  category: 'cultural',
  taken_on: '',
  location: '',
  image_url: null,
  image_key: null,
  sort_order: 0,
  published: true
};

export const GalleryAdmin: React.FC = () => {
  const refreshContent = useAppStore((state) => state.refreshContent);

  const [rows, setRows] = useState<GalleryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<GalleryForm>(BLANK_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setRows(await fetchAllGalleryForAdmin());
    } catch (loadError) {
      console.error('[PAWTX] Failed to load gallery for admin', loadError);
      setError('Could not load the gallery.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = (row: GalleryRow) => {
    setEditingId(row.id);
    setForm({
      title: row.title,
      title_es: row.title_es,
      caption: row.caption,
      caption_es: row.caption_es,
      category: row.category,
      taken_on: row.taken_on,
      location: row.location,
      image_url: row.image_url,
      image_key: row.image_key,
      sort_order: row.sort_order,
      published: row.published
    });
  };

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    setError(null);
    try {
      const url = await uploadMedia(file, 'gallery');
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

    if (!form.image_url && !form.image_key) {
      setError('A photo is required for a gallery item.');
      return;
    }

    setIsSaving(true);
    setError(null);

    const payload = {
      title: form.title,
      title_es: form.title_es,
      caption: form.caption,
      caption_es: form.caption_es,
      category: form.category,
      taken_on: form.taken_on,
      location: form.location,
      image_url: form.image_url,
      image_key: form.image_key,
      sort_order: Number(form.sort_order),
      published: form.published
    };

    try {
      if (editingId === 'new') {
        await createGalleryItem(payload);
      } else if (editingId) {
        await updateGalleryItem(editingId, payload);
      }
      setEditingId(null);
      await load();
      await refreshContent();
    } catch (saveError) {
      console.error('[PAWTX] Failed to save gallery item', saveError);
      setError('Could not save this photo.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (row: GalleryRow) => {
    if (!window.confirm(`Remove "${row.title}" from the gallery?`)) return;
    try {
      await deleteGalleryItem(row.id);
      await load();
      await refreshContent();
    } catch (deleteError) {
      console.error('[PAWTX] Failed to delete gallery item', deleteError);
      setError('Could not delete this photo.');
    }
  };

  const togglePublished = async (row: GalleryRow) => {
    try {
      await updateGalleryItem(row.id, { published: !row.published });
      await load();
      await refreshContent();
    } catch (toggleError) {
      console.error('[PAWTX] Failed to change photo visibility', toggleError);
      setError('Could not change visibility.');
    }
  };

  const field = 'w-full bg-[#FDFBF7] border border-[#E5E0D8] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#A64D32]';
  const label = 'block text-xs font-bold uppercase tracking-[0.2em] text-[#5A5A5A] mb-1';

  return (
    <div className="space-y-6">

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-serif font-bold">Gallery</h2>
        <button
          onClick={() => { setEditingId('new'); setForm(BLANK_FORM); }}
          className="flex items-center gap-2 bg-[#A64D32] hover:bg-[#8b3f28] text-white px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Photo</span>
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
            {editingId === 'new' ? 'Add photo' : 'Edit photo'}
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
              <label className={label}>Caption (English) *</label>
              <textarea required rows={3} className={field} value={form.caption}
                onChange={(e) => setForm({ ...form, caption: e.target.value })} />
            </div>
            <div>
              <label className={label}>Descripción (Español) *</label>
              <textarea required rows={3} className={field} value={form.caption_es}
                onChange={(e) => setForm({ ...form, caption_es: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className={label}>Category</label>
              <select className={field} value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as GalleryRow['category'] })}>
                <option value="cooking">Cooking</option>
                <option value="cultural">Cultural</option>
                <option value="seminars">Seminars</option>
                <option value="relief">Relief</option>
              </select>
            </div>
            <div>
              {/* Only the month and year are shown on the site; the day is
                  stored but never rendered. */}
              <label className={label}>Date taken *</label>
              <input required type="date" className={field} value={form.taken_on}
                onChange={(e) => setForm({ ...form, taken_on: e.target.value })} />
            </div>
            <div>
              <label className={label}>Sort order</label>
              <input type="number" className={field} value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
            </div>
            <div className="flex items-end pb-2.5">
              <label className="flex items-center gap-2 text-xs font-bold text-[#5A5A5A] cursor-pointer">
                <input type="checkbox" checked={form.published}
                  onChange={(e) => setForm({ ...form, published: e.target.checked })} />
                Published
              </label>
            </div>
          </div>

          <div>
            <label className={label}>Location *</label>
            <input required className={field} value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>

          <div>
            <label className={label}>Photo *</label>
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
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSaving || isUploading}
              className="bg-[#A64D32] hover:bg-[#8b3f28] text-white px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save photo'}
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
        <p className="text-sm text-[#5A5A5A]">Loading gallery...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[#5A5A5A]">No photos yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map((row) => (
            <div key={row.id} className="bg-[#F4F1ED] border border-[#E5E0D8] rounded-2xl overflow-hidden">
              <img
                src={resolveImage(row.image_key, row.image_url)}
                alt={row.title}
                loading="lazy"
                className="w-full h-36 object-cover"
              />
              <div className="p-4 space-y-2">
                <div className="font-bold text-sm">{row.title}</div>
                <div className="text-xs text-[#5A5A5A]">{row.location}</div>
                {!row.published && (
                  <span className="inline-block text-[10px] font-bold uppercase tracking-wider bg-[#5A5A5A]/15 text-[#5A5A5A] px-2 py-0.5 rounded-full">
                    Hidden
                  </span>
                )}
                <div className="flex items-center gap-1 pt-1">
                  <button onClick={() => togglePublished(row)} title={row.published ? 'Hide' : 'Show'}
                    className="p-2 rounded-lg hover:bg-[#FDFBF7] text-[#5A5A5A] cursor-pointer">
                    {row.published ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <button onClick={() => startEdit(row)} title="Edit"
                    className="p-2 rounded-lg hover:bg-[#FDFBF7] text-[#5A5A5A] cursor-pointer">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(row)} title="Delete"
                    className="p-2 rounded-lg hover:bg-[#A64D32]/10 text-[#A64D32] cursor-pointer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
