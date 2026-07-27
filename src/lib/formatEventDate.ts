/**
 * Display formatting for the timestamps coming out of Postgres.
 *
 * The seed data used to carry pre-baked human strings ("Saturday, August 15,
 * 2026"), which is unworkable now that admins create events through a form and
 * every label needs an English and a Spanish variant. The database stores real
 * `timestamptz` values and these helpers render them.
 *
 * Everything is formatted in Central Time regardless of the viewer's own
 * timezone: PAWTX runs in Odessa/Midland, so "6:30 PM" must mean 6:30 PM at
 * the venue, not 4:30 PM for someone reading from California.
 */

export const EVENT_TIME_ZONE = 'America/Chicago';

type Language = 'en' | 'es';

const localeFor = (language: Language) => (language === 'es' ? 'es-US' : 'en-US');

/**
 * Parses a Postgres `date` column ("2025-10-01").
 *
 * `new Date('2025-10-01')` is parsed as UTC midnight by spec, which formats as
 * September 30 once shifted into Central Time. Building the date from its
 * parts at midday sidesteps the off-by-one entirely.
 */
export function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    const fallback = new Date(value);
    return isNaN(fallback.getTime()) ? null : fallback;
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
}

export function parseTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

/** "Saturday, August 15, 2026" / "sábado, 15 de agosto de 2026" */
export function formatEventDayLabel(date: Date, language: Language): string {
  return new Intl.DateTimeFormat(localeFor(language), {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: EVENT_TIME_ZONE
  }).format(date);
}

/** "5:30 PM" / "5:30 p.m." */
export function formatEventClock(date: Date, language: Language): string {
  return new Intl.DateTimeFormat(localeFor(language), {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: EVENT_TIME_ZONE
  }).format(date);
}

/**
 * "5:30 PM - 8:30 PM", or just the start time when an event has no end.
 * The " - " separator is load-bearing: EventCalendar splits on it to show only
 * the start time in the compact month grid.
 */
export function formatEventTimeRange(start: Date, end: Date | null, language: Language): string {
  const startLabel = formatEventClock(start, language);
  if (!end) return startLabel;
  return `${startLabel} - ${formatEventClock(end, language)}`;
}

/** "October 2025" / "octubre de 2025" — the gallery only shows month precision. */
export function formatMonthLabel(date: Date, language: Language): string {
  return new Intl.DateTimeFormat(localeFor(language), {
    month: 'long',
    year: 'numeric',
    timeZone: EVENT_TIME_ZONE
  }).format(date);
}

/** "March 2024" style label for a volunteer's join date. */
export const formatJoinedLabel = formatMonthLabel;

/**
 * Offset of `timeZone` from UTC at a given instant, in milliseconds.
 * Positive east of Greenwich; Central Time returns -5h or -6h depending on
 * daylight saving.
 */
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(instant);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');

  // Reading the zone's wall clock as if it were UTC and diffing against the
  // real instant gives exactly the offset.
  const wallClockAsUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24, // some ICU builds render midnight as hour 24
    get('minute'),
    get('second')
  );

  return wallClockAsUtc - instant.getTime();
}

/**
 * Converts a `datetime-local` value ("2026-08-15T17:30") read as Central Time
 * into an ISO instant for storage.
 *
 * The admin form has no timezone picker by design — staff enter the time at
 * the venue. Without this conversion an event created from a laptop set to
 * another zone would be stored, and displayed, hours off.
 */
export function wallClockToInstant(
  wallClock: string,
  timeZone: string = EVENT_TIME_ZONE
): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(wallClock)) return null;

  const guess = new Date(`${wallClock.slice(0, 16)}:00Z`);
  if (isNaN(guess.getTime())) return null;

  const firstOffset = timeZoneOffsetMs(guess, timeZone);
  let instant = new Date(guess.getTime() - firstOffset);

  // A second pass settles the two hours a year when the first guess lands on
  // the other side of a daylight-saving transition.
  const settledOffset = timeZoneOffsetMs(instant, timeZone);
  if (settledOffset !== firstOffset) {
    instant = new Date(guess.getTime() - settledOffset);
  }

  return instant;
}

/** Inverse of `wallClockToInstant`, for populating a `datetime-local` input. */
export function instantToWallClock(
  iso: string | null | undefined,
  timeZone: string = EVENT_TIME_ZONE
): string {
  const instant = parseTimestamp(iso);
  if (!instant) return '';

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).formatToParts(instant);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '00';

  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
}
