import { PAWTXEvent } from '../../types';
import type { Tables } from '../database.types';
import { requireSupabase } from '../supabaseClient';
import {
  formatEventDayLabel,
  formatEventTimeRange,
  parseTimestamp
} from '../formatEventDate';
import { resolveImage } from './images';

export type EventRow = Tables<'events'>;

/**
 * Turns a database row into the shape the components already expect.
 *
 * `date` and `time` are display labels derived here rather than stored, so the
 * store re-runs this mapping when the language changes.
 */
export function mapEventRow(row: EventRow, language: 'en' | 'es'): PAWTXEvent {
  const start = parseTimestamp(row.starts_at);
  const end = parseTimestamp(row.ends_at);

  return {
    id: row.id,
    title: row.title,
    titleEs: row.title_es,
    description: row.description,
    descriptionEs: row.description_es,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    date: start ? formatEventDayLabel(start, language) : '',
    time: start ? formatEventTimeRange(start, end, language) : '',
    location: row.location,
    category: row.category,
    totalSpots: row.total_spots,
    reservedSpots: row.reserved_spots,
    imageUrl: resolveImage(row.image_key, row.image_url),
    status: row.status,
    featured: row.featured
  };
}

/**
 * Published events, soonest first.
 *
 * RLS already restricts anonymous readers to published rows; the explicit
 * filter keeps admins (who can see drafts) from getting them on public pages.
 */
export async function fetchEvents(): Promise<EventRow[]> {
  const { data, error } = await requireSupabase()
    .from('events')
    .select('*')
    .eq('published', true)
    .order('starts_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/** Every event including unpublished drafts — admin panel only. */
export async function fetchAllEventsForAdmin(): Promise<EventRow[]> {
  const { data, error } = await requireSupabase()
    .from('events')
    .select('*')
    .order('starts_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/** Re-reads one event, used to refresh the seat count after an RSVP. */
export async function fetchEventById(id: string): Promise<EventRow | null> {
  const { data, error } = await requireSupabase()
    .from('events')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data;
}
