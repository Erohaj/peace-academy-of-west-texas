export type EventCategory = 'all' | 'cooking' | 'cultural' | 'seminars' | 'relief';

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
  imageUrl: string;
  status: 'upcoming' | 'ongoing' | 'past';
  featured?: boolean;
}

export interface RSVP {
  id: string;
  eventId: string;
  fullName: string;
  email: string;
  phone: string;
  guestCount: number;
  optionalDonation?: number;
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

export type ActiveTab = 'home' | 'events' | 'social' | 'gallery' | 'donate' | 'volunteer' | 'admin';

/** Loading state for anything fetched from Supabase. */
export type DataStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Failure reasons an action can report back to the UI.
 *
 * The RSVP codes mirror the SQLSTATEs raised by `create_rsvp()`:
 * PA001 → event_full, PA002 → already_registered, PA003 → event_not_found,
 * PA004 → invalid_guest_count.
 */
export type ActionError =
  | 'event_full'
  | 'already_registered'
  | 'event_not_found'
  | 'invalid_guest_count'
  | 'shift_full'
  | 'not_configured'
  | 'unauthenticated'
  | 'rate_limited'
  | 'network';

/**
 * `error` is declared on the success branch too (as `undefined`) so the field
 * is always reachable. This project compiles without `strictNullChecks`, and
 * without it TypeScript does not narrow a union by a boolean discriminant —
 * `result.error` inside an `else` would be an error rather than a narrowing.
 */
export type ActionResult = { ok: true; error?: undefined } | { ok: false; error: ActionError };

export type SocialPlatform = 'all' | 'instagram' | 'facebook' | 'youtube' | 'x';

export interface SocialPostComment {
  id: string;
  authorName: string;
  authorAvatar: string;
  text: string;
  createdAt: string;
}

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
  isLiked?: boolean;
  isBookmarked?: boolean;
  commentsList?: SocialPostComment[];
}
