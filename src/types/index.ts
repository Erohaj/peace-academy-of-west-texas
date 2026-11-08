export type EventCategory = 'all' | 'cooking' | 'cultural' | 'seminars' | 'relief';

/**
 * Photo/video permission, using the same three answers as the media-consent
 * document volunteers sign. `null` on an RSVP means the question was never
 * asked — treat it as "do not publish", not as consent.
 */
export type MediaConsent = 'yes' | 'photos_only' | 'no';

export interface PAWTXEvent {
  id: string;
  title: string;
  titleEs: string;
  description: string;
  descriptionEs: string;
  /** ISO timestamp from the database — the source of truth for when this is. */
  startsAt: string;
  endsAt: string | null;
  /**
   * Display labels derived from `startsAt`/`endsAt` in the current language
   * (see src/lib/formatEventDate.ts). The store re-derives them whenever the
   * language changes, so components can render them directly.
   */
  date: string;
  time: string;
  location: string;
  category: EventCategory;
  totalSpots: number;
  reservedSpots: number;
  /**
   * Cost per attendee in US dollars, or null when no price has been
   * stated. Null and 0 are different answers: 0 is a published "Free",
   * null is "the organisers have not said" and renders nothing.
   */
  fee: number | null;
  /**
   * When true, the seat is only real once `fee` has been paid: the RSVP form
   * sends the visitor to Stripe and the booking is held for about half an hour
   * meanwhile. False — the default, and every event before this existed —
   * means `fee` is a published figure settled at the door, and the RSVP itself
   * costs nothing. Never derived from `fee`: a price is not the same statement
   * as a requirement to prepay.
   */
  paymentRequired: boolean;
  imageUrl: string;
  status: 'upcoming' | 'ongoing' | 'past';
  featured?: boolean;
  /** When true, the RSVP form asks for photo/video permission and requires it. */
  collectMediaConsent: boolean;
}

/**
 * Where a booking stands on the money.
 *
 * `not_required` is not a payment state so much as the absence of one: a free
 * event, or one whose fee this site does not collect. It is the default and
 * still describes almost every booking in the table.
 */
export type RsvpPaymentStatus =
  | 'not_required'
  | 'pending'
  | 'paid'
  | 'failed'
  | 'refunded';

export interface RSVP {
  id: string;
  eventId: string;
  fullName: string;
  email: string;
  phone: string;
  guestCount: number;
  optionalDonation?: number;
  mediaConsent?: MediaConsent | null;
  createdAt: string;
}

export type GalleryCategory = 'all' | 'cooking' | 'cultural' | 'seminars' | 'relief';

export interface GalleryItem {
  id: string;
  title: string;
  titleEs: string;
  category: GalleryCategory;
  imageUrl: string;
  caption: string;
  captionEs: string;
  /** ISO date (YYYY-MM-DD) from the database. */
  takenOn: string;
  /** Month-precision label derived from `takenOn`, e.g. "October 2025". */
  date: string;
  location: string;
}

export type VolunteerRole = 'Food Prep' | 'Event Setup' | 'Greeter' | 'Translator' | 'Distribution' | 'General Support';

export interface Shift {
  id: string;
  /**
   * The event this shift belongs to. Nullable in the database — `on delete set
   * null` keeps a shift whose event was removed — and so nullable here, which
   * is also what keeps a standing shift out of any one event's volunteer form.
   */
  eventId: string | null;
  title: string;
  titleEs: string;
  role: VolunteerRole;
  roleEs: string;
  /** ISO timestamps from the database. */
  startsAt: string;
  endsAt: string;
  /** Display labels derived from the timestamps in the current language. */
  date: string;
  time: string;
  durationHours: number;
  spotsTotal: number;
  spotsFilled: number;
  description: string;
  descriptionEs: string;
  isTakenByMe?: boolean;
}

/**
 * One person who signed up for a shift without an account.
 *
 * Has no `id` of a profile and never will: this is the low-barrier path for a
 * single event, and the hours ledger a certificate reads from only credits
 * accounts. `attendance` is what staff observed on the day and credits
 * nothing — see supabase/migrations/*_event_volunteers.sql.
 */
export interface EventVolunteer {
  id: string;
  shiftId: string;
  fullName: string;
  email: string;
  phone: string | null;
  note: string | null;
  attendance: 'attended' | 'no_show' | null;
  language: 'en' | 'es';
  /** ISO timestamp; the admin list is ordered by it. */
  createdAt: string;
}

export interface VolunteerProfile {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  avatarUrl?: string;
  /** Gates the admin panel. Enforced for real by RLS, not by this field. */
  role: 'volunteer' | 'admin';
  totalHours: number;
  shiftsCompleted: number;
  badges: string[];
  joinedDate: string;
}

export interface Donation {
  id: string;
  amount: number;
  frequency: 'one_time' | 'monthly';
  donorName?: string;
  donorEmail?: string;
  impactLabel: string;
  impactLabelEs: string;
  createdAt: string;
}

export type ActiveTab =
  | 'home'
  | 'events'
  | 'social'
  | 'gallery'
  | 'donate'
  | 'volunteer'
  | 'admin'
  // Reached by scanning the QR on a certificate, not from the navigation. The
  // visitor is a school registrar or a court officer checking somebody else's
  // document, so it is deliberately absent from the menu.
  | 'verify';

/** Loading state for anything fetched from Supabase. */
export type DataStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Failure reasons an action can report back to the UI.
 *
 * The RSVP codes mirror the SQLSTATEs raised by `create_rsvp()`:
 * PA001 → event_full, PA002 → already_registered, PA003 → event_not_found,
 * PA004 → invalid_guest_count, PA005 → media_consent_required,
 * PA006 → event_over.
 */
export type ActionError =
  | 'event_full'
  | 'already_registered'
  | 'event_not_found'
  | 'invalid_guest_count'
  | 'media_consent_required'
  | 'event_over'
  | 'shift_full'
  // The shift behind a signup link is gone or was unpublished while the page
  // sat open. Distinct from 'event_not_found' because the volunteer form talks
  // about shifts, and telling somebody the event does not exist when it is the
  // shift that went away sends them looking in the wrong place.
  | 'shift_not_found'
  // The shift has finished. Checked in the database rather than the browser:
  // a page left open since yesterday would otherwise still submit.
  | 'shift_over'
  // signup_event_volunteer rejected the name or the address. The form checks
  // both before submitting, so this is the defensive case — mapped anyway,
  // because "something went wrong" would hide a fixable typo.
  | 'invalid_volunteer_details'
  | 'not_configured'
  | 'unauthenticated'
  | 'rate_limited'
  // A prepaid event this site cannot currently take money for: the Stripe key
  // is missing, the event is marked prepaid with no price, or the ticket
  // feature flag is off. Distinct from 'network' because there is nothing for
  // the visitor to retry — the answer is to get in touch instead.
  | 'payment_unavailable'
  | 'network';

/**
 * `error` is declared on the success branch too (as `undefined`) so the field
 * is always reachable. This project compiles without `strictNullChecks`, and
 * without it TypeScript does not narrow a union by a boolean discriminant —
 * `result.error` inside an `else` would be an error rather than a narrowing.
 */
export type ActionResult = { ok: true; error?: undefined } | { ok: false; error: ActionError };

export type SocialPlatform = 'all' | 'instagram' | 'facebook' | 'youtube' | 'x';

export interface SocialPost {
  id: string;
  platform: 'instagram' | 'facebook' | 'youtube' | 'x';
  author: {
    name: string;
    handle: string;
    avatarUrl: string;
    verified?: boolean;
  };
  content: string;
  contentEs: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  publishedAt: string;
  publishedAtRelative: string;
  publishedAtRelativeEs: string;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  postUrl: string;
  tags?: string[];
}
