import { PAWTXEvent } from '../types';
import { EVENT_TIME_ZONE, parseTimestamp } from './formatEventDate';

// Fallback window (2 hours) used when an event has no end time recorded, so an
// "Add to Calendar" link still produces a sensible block.
const FALLBACK_DURATION_MS = 2 * 60 * 60 * 1000;

/**
 * Calendar-day parts for an event, resolved in the venue's timezone.
 *
 * These used to come from parsing a human string ("Saturday, August 15, 2026")
 * with `new Date`. Now that events carry a real timestamptz, the day has to be
 * derived *in Central Time* — otherwise a visitor reading from Tokyo would see
 * a Friday-evening event land on Saturday in the month grid.
 *
 * `dateObj` is local midday on that calendar day, which is what the calendar
 * grid wants for its day-by-day arithmetic.
 */
export function getEventDateParts(
  event: Pick<PAWTXEvent, 'startsAt'>
): { year: number; month: number; day: number; isoDate: string; dateObj: Date } | null {
  const start = parseTimestamp(event.startsAt);
  if (!start) return null;

  // en-CA yields ISO-ordered "2026-08-15", which is trivial to split.
  const isoDate = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: EVENT_TIME_ZONE
  }).format(start);

  const [year, month, day] = isoDate.split('-').map(Number);

  return {
    year,
    month: month - 1, // callers expect a 0-indexed month, like Date#getMonth
    day,
    isoDate,
    dateObj: new Date(year, month - 1, day, 12, 0, 0)
  };
}

/**
 * The same parts for today, resolved in the venue's timezone.
 *
 * Not `new Date()` read with getMonth(): a visitor in Tokyo late on a Friday
 * evening Central time is already on Saturday locally, and the calendar's
 * "Today" button should land on the day the venue is having.
 */
export function getTodayParts(): { year: number; month: number; day: number; isoDate: string } {
  const isoDate = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: EVENT_TIME_ZONE
  }).format(new Date());

  const [year, month, day] = isoDate.split('-').map(Number);
  return { year, month: month - 1, day, isoDate };
}

// Google Calendar's local-time format: YYYYMMDDTHHMMSS (no trailing Z, so it
// is read as wall-clock time in the `ctz` zone rather than UTC).
function toCalendarStamp(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: EVENT_TIME_ZONE
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '00';

  // Intl renders midnight as hour "24" in some ICU versions of the h23 cycle.
  const hour = get('hour') === '24' ? '00' : get('hour');

  return `${get('year')}${get('month')}${get('day')}T${hour}${get('minute')}${get('second')}`;
}

/**
 * Builds an "Add to Google Calendar" URL carrying the event's real day and
 * start/end time. Used by both the event calendar and the RSVP confirmation.
 */
export function getGoogleCalendarUrl(event: PAWTXEvent, isSpanish: boolean): string {
  const title = isSpanish ? event.titleEs : event.title;
  const description = isSpanish ? event.descriptionEs : event.description;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    details: description,
    location: event.location
  });

  const start = parseTimestamp(event.startsAt);
  if (start) {
    const end = parseTimestamp(event.endsAt) ?? new Date(start.getTime() + FALLBACK_DURATION_MS);
    params.set('dates', `${toCalendarStamp(start)}/${toCalendarStamp(end)}`);
    params.set('ctz', EVENT_TIME_ZONE);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Whole calendar days from today to the event, counted in the venue's
 * timezone. 0 is today, 1 tomorrow, negative is already past.
 *
 * Counted between calendar days rather than by dividing a millisecond gap: an
 * event at 9am tomorrow is "tomorrow" even though it is only fourteen hours
 * out, which is how someone reading the poster thinks about it. Central Time
 * again, for the same reason `getTodayParts` is — late Friday in Tokyo must
 * not turn Saturday's dinner into "today".
 */
export function getDaysUntilEvent(event: Pick<PAWTXEvent, 'startsAt'>): number | null {
  const parts = getEventDateParts(event);
  if (!parts) return null;

  const today = getTodayParts();
  const startDay = Date.UTC(parts.year, parts.month, parts.day);
  const todayDay = Date.UTC(today.year, today.month, today.day);

  return Math.round((startDay - todayDay) / (24 * 60 * 60 * 1000));
}

/**
 * True while the event has started and has not finished yet.
 *
 * Only an event with a recorded `ends_at` can be "in progress" here: one
 * without an end time is filtered out of the public feed the moment it starts
 * (see `fetchEvents`), so it can never reach this.
 */
export function isEventInProgress(event: Pick<PAWTXEvent, 'startsAt' | 'endsAt'>): boolean {
  const start = parseTimestamp(event.startsAt);
  if (!start) return false;

  const now = Date.now();
  if (start.getTime() > now) return false;

  const end = parseTimestamp(event.endsAt);
  return end ? end.getTime() > now : false;
}
