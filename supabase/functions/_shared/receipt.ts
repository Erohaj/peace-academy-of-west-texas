/**
 * The donor-facing confirmation number printed on a receipt.
 *
 * Donors quote this on the phone and in email, so it has to be short enough to
 * read aloud; the full row id is a 36-character UUID and is not. The first
 * eight hex digits carry 32 bits, so at the scale this organisation gives and
 * receives — a few hundred donations a year — two receipts colliding stays
 * well under one chance in a million, and `donations.id` is still the primary
 * key sitting behind the short form.
 *
 * Hex rather than base-36 because hex has no 0/O or 1/l pair to mishear, and
 * uppercase because that is how someone reads a code off a screen.
 *
 * Both writers derive the number here: the receipt email in `stripe-webhook`
 * and the Stripe metadata written at checkout. Deriving it separately in two
 * places is how a donor ends up quoting a code that matches nothing.
 */
export function confirmationNumber(donationId: string): string {
  return donationId.replace(/-/g, '').slice(0, 8).toUpperCase();
}
