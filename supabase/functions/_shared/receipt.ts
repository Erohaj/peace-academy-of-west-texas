/**
 * The confirmation number printed on a receipt — for a donation, and since
 * prepaid tickets, for a booking too.
 *
 * People quote this on the phone and in email, so it has to be short enough to
 * read aloud; the full row id is a 36-character UUID and is not. The first
 * eight hex digits carry 32 bits, so at the scale this organisation gives and
 * receives — a few hundred payments a year — two receipts colliding stays
 * well under one chance in a million, and the row id is still the primary key
 * sitting behind the short form.
 *
 * Hex rather than base-36 because hex has no 0/O or 1/l pair to mishear, and
 * uppercase because that is how someone reads a code off a screen.
 *
 * Every writer derives the number here: the donation receipt in
 * `stripe-webhook`, the ticket confirmation in `send-rsvp-confirmation`, the
 * `ticket-status` lookup the thank-you screen reads, and the Stripe metadata
 * written at checkout by both create-…-session functions. Deriving it
 * separately anywhere is how somebody ends up quoting a code that matches
 * nothing.
 *
 * Takes the `donations.id` or `rsvps.id` of the row being acknowledged. The
 * two tables cannot collide into one another in any way that matters: nothing
 * looks a number up without already knowing which of the two it is asking
 * about.
 */
export function confirmationNumber(rowId: string): string {
  return rowId.replace(/-/g, '').slice(0, 8).toUpperCase();
}
