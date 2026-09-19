/**
 * How an event's price is written out.
 *
 * Three states, not two, and the difference is the whole point of this file:
 *
 *   null  — no price has been stated. Renders nothing at all; a nonprofit must
 *           not appear to quote a price its organisers never set.
 *   0     — explicitly free. Renders the word, because "free" is a selling
 *           point and its absence reads as "they just forgot to say".
 *   > 0   — the amount.
 *
 * `freeLabel` is passed in rather than looked up here so this stays a plain
 * function: the calendar renders a fee inside a `.map()` over its events,
 * where a hook calling `useTranslation` could not go.
 */
export function formatEventFee(
  fee: number | null | undefined,
  language: 'en' | 'es',
  freeLabel: string
): string | null {
  if (fee === null || fee === undefined) return null;
  if (fee <= 0) return freeLabel;

  return new Intl.NumberFormat(language === 'es' ? 'es-US' : 'en-US', {
    style: 'currency',
    currency: 'USD',
    // "$60", not "$60.00". These are poster prices, and the trailing zeros
    // make one read like a line on an invoice. A fee with real cents in it
    // still gets both digits.
    minimumFractionDigits: Number.isInteger(fee) ? 0 : 2,
    maximumFractionDigits: 2
  }).format(fee);
}
