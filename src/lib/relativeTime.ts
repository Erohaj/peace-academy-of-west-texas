const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60]
];

// Computed at render time from `publishedAt` so live-fetched posts (whose
// baked publishedAtRelative strings go stale between GitHub Action runs)
// always show an accurate age.
export function formatRelativeTime(iso: string, lang: 'en' | 'es'): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const diffSec = Math.round((Date.now() - then) / 1000);
  const rtf = new Intl.RelativeTimeFormat(lang === 'es' ? 'es' : 'en', { numeric: 'auto' });

  for (const [unit, secondsInUnit] of UNITS) {
    if (diffSec >= secondsInUnit) {
      return rtf.format(-Math.floor(diffSec / secondsInUnit), unit);
    }
  }
  return rtf.format(0, 'second');
}
