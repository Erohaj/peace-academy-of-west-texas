import { PAWTXEvent } from '../types';

// PAWTX operates in Odessa/Midland, TX — Central Time. Google Calendar links
// pin the event to this zone so the times don't shift for out-of-state viewers.
const EVENT_TIME_ZONE = 'America/Chicago';

// Fallback window (5:00–7:00 PM local) used when an event's time string can't
// be parsed, so an "Add to Calendar" link still lands on the right day.
const FALLBACK_START_MINUTES = 17 * 60;
const FALLBACK_DURATION_MINUTES = 120;

// Seed-data dates are human strings like "Saturday, August 15, 2026" — strip
// the weekday prefix before handing them to Date.
export function parseEventDate(
  dateStr: string
): { year: number; month: number; day: number; isoDate: string; dateObj: Date } | null {
  if (!dateStr) return null;
  const cleaned = dateStr.replace(/^[A-Za-z]+,\s*/, '').trim();
  const d = new Date(cleaned);
  if (isNaN(d.getTime())) return null;

  const year = d.getFullYear();
  const month = d.getMonth(); // 0-indexed
  const day = d.getDate();
  const isoDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { year, month, day, isoDate, dateObj: d };
}

// "5:30 PM" → minutes since midnight, or null if it isn't in that shape.
function parseClockTime(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;

  const minutes = Number(match[2]);
  if (minutes > 59) return null;

  let hours = Number(match[1]) % 12;
  if (match[3].toUpperCase() === 'PM') hours += 12;
  return hours * 60 + minutes;
}

// Seed-data times are ranges like "5:30 PM - 8:30 PM".
function parseEventTimeRange(timeStr: string): { startMinutes: number; endMinutes: number } {
  const [rawStart, rawEnd] = (timeStr || '').split('-');
  const startMinutes = rawStart ? parseClockTime(rawStart) : null;

  if (startMinutes === null) {
    return {
      startMinutes: FALLBACK_START_MINUTES,
      endMinutes: FALLBACK_START_MINUTES + FALLBACK_DURATION_MINUTES,
    };
  }

  const parsedEnd = rawEnd ? parseClockTime(rawEnd) : null;
  // Guard against a malformed or backwards range (e.g. an end before the start).
  const endMinutes =
    parsedEnd !== null && parsedEnd > startMinutes
      ? parsedEnd
      : startMinutes + FALLBACK_DURATION_MINUTES;

  return { startMinutes, endMinutes };
}

// Google Calendar's local-time format: YYYYMMDDTHHMMSS (no trailing Z, so it is
// read as wall-clock time in the `ctz` zone rather than UTC).
function toCalendarStamp(year: number, month: number, day: number, minutesFromMidnight: number): string {
  const stampDate = new Date(year, month, day);
  stampDate.setMinutes(minutesFromMidnight);

  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${stampDate.getFullYear()}${pad(stampDate.getMonth() + 1)}${pad(stampDate.getDate())}` +
    `T${pad(stampDate.getHours())}${pad(stampDate.getMinutes())}00`
  );
}

// Builds an "Add to Google Calendar" URL carrying the event's real day and
// start/end time. Used by both the event calendar and the RSVP confirmation.
export function getGoogleCalendarUrl(event: PAWTXEvent, isSpanish: boolean): string {
  const title = isSpanish ? event.titleEs : event.title;
  const description = isSpanish ? event.descriptionEs : event.description;
  const parsed = parseEventDate(event.date);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    details: description,
    location: event.location,
  });

  if (parsed) {
    const { startMinutes, endMinutes } = parseEventTimeRange(event.time);
    const start = toCalendarStamp(parsed.year, parsed.month, parsed.day, startMinutes);
    const end = toCalendarStamp(parsed.year, parsed.month, parsed.day, endMinutes);
    params.set('dates', `${start}/${end}`);
    params.set('ctz', EVENT_TIME_ZONE);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
