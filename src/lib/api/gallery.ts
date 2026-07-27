import { GalleryItem } from '../../types';
import type { Tables } from '../database.types';
import { requireSupabase } from '../supabaseClient';
import { formatMonthLabel, parseDateOnly } from '../formatEventDate';
import { resolveImage } from './images';

export type GalleryRow = Tables<'gallery_items'>;

export function mapGalleryRow(row: GalleryRow, language: 'en' | 'es'): GalleryItem {
  const takenOn = parseDateOnly(row.taken_on);

  return {
    id: row.id,
    title: row.title,
    titleEs: row.title_es,
    category: row.category,
    imageUrl: resolveImage(row.image_key, row.image_url),
    caption: row.caption,
    captionEs: row.caption_es,
    takenOn: row.taken_on,
    // The gallery only ever shows month precision ("October 2025").
    date: takenOn ? formatMonthLabel(takenOn, language) : '',
    location: row.location
  };
}

export async function fetchGallery(): Promise<GalleryRow[]> {
  const { data, error } = await requireSupabase()
    .from('gallery_items')
    .select('*')
    .eq('published', true)
    .order('sort_order', { ascending: true })
    .order('taken_on', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function fetchAllGalleryForAdmin(): Promise<GalleryRow[]> {
  const { data, error } = await requireSupabase()
    .from('gallery_items')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data ?? [];
}
