import type { Tables, TablesInsert, TablesUpdate } from '../database.types';
import { requireSupabase } from '../supabaseClient';

/**
 * Write operations for the staff admin panel.
 *
 * Every call here is rejected by RLS unless the signed-in user's profile has
 * `role = 'admin'`. The panel's UI guard is only there to avoid showing
 * controls that would fail.
 */

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export async function createEvent(input: TablesInsert<'events'>): Promise<Tables<'events'>> {
  const { data, error } = await requireSupabase().from('events').insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function updateEvent(
  id: string,
  patch: TablesUpdate<'events'>
): Promise<Tables<'events'>> {
  const { data, error } = await requireSupabase()
    .from('events')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await requireSupabase().from('events').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------------

export async function createGalleryItem(
  input: TablesInsert<'gallery_items'>
): Promise<Tables<'gallery_items'>> {
  const { data, error } = await requireSupabase()
    .from('gallery_items')
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateGalleryItem(
  id: string,
  patch: TablesUpdate<'gallery_items'>
): Promise<Tables<'gallery_items'>> {
  const { data, error } = await requireSupabase()
    .from('gallery_items')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteGalleryItem(id: string): Promise<void> {
  const { error } = await requireSupabase().from('gallery_items').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Contact messages
// ---------------------------------------------------------------------------

export async function fetchContactMessages(limit = 200): Promise<Tables<'contact_messages'>[]> {
  const { data, error } = await requireSupabase()
    .from('contact_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function markContactHandled(id: string, handled: boolean): Promise<void> {
  const { error } = await requireSupabase()
    .from('contact_messages')
    .update({ handled })
    .eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Media uploads
// ---------------------------------------------------------------------------

/** Long edge, in pixels, that uploaded photos are reduced to before upload. */
const MAX_EDGE = 1600;
const WEBP_QUALITY = 0.82;

/**
 * Resizes and re-encodes an image in the browser before it is uploaded.
 *
 * The bundled photos go through scripts/optimize-images.mjs (sharp) at build
 * time, but that pipeline cannot touch anything an admin uploads at runtime.
 * Without this step a straight-from-phone photo — routinely 6-12 MB — would be
 * served to every visitor on the events page.
 */
export async function resizeImageFile(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context is unavailable');

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY)
  );

  if (!blob) throw new Error('Could not encode the image');
  return blob;
}

/**
 * Uploads a photo to the public `media` bucket and returns its URL.
 *
 * `folder` keeps events and gallery items apart so the bucket stays browsable
 * in the Supabase dashboard.
 */
export async function uploadMedia(file: File, folder: 'events' | 'gallery'): Promise<string> {
  const supabase = requireSupabase();
  const blob = await resizeImageFile(file);

  // Random name: two admins uploading "IMG_0042.jpg" must not overwrite each
  // other, and the original filename can contain characters Storage rejects.
  const path = `${folder}/${crypto.randomUUID()}.webp`;

  const { error } = await supabase.storage.from('media').upload(path, blob, {
    contentType: 'image/webp',
    cacheControl: '31536000',
    upsert: false
  });

  if (error) throw error;

  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl;
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

/**
 * Serialises rows to CSV for download.
 *
 * Values are quoted and internal quotes doubled per RFC 4180. A leading
 * `=`, `+`, `-` or `@` is prefixed with a quote so a name like "=cmd()" is
 * shown as text rather than executed as a formula when the file is opened in
 * Excel or Sheets.
 */
export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    let text = String(value);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };

  const header = columns.map(escape).join(',');
  const body = rows.map((row) => columns.map((column) => escape(row[column])).join(','));

  return [header, ...body].join('\r\n');
}

/** Triggers a client-side download of the given CSV text. */
export function downloadCsv(filename: string, csv: string): void {
  // The BOM makes Excel open UTF-8 correctly — without it, Spanish accents in
  // names and event titles come out mangled.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}
