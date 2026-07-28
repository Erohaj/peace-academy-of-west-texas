import { create } from 'zustand';
import {
  ActionError,
  ActionResult,
  ActiveTab,
  DataStatus,
  GalleryItem,
  MediaConsent,
  PAWTXEvent,
  Shift,
  VolunteerProfile
} from '../types';
import i18n from '../i18n/config';
import {
  getSiteUrl,
  isSupabaseConfigured,
  supabase,
  warnIfRedirectLikelyUnlisted
} from '../lib/supabaseClient';
import { reportError } from '../lib/api/errors';
import { EventRow, fetchEvents, mapEventRow } from '../lib/api/events';
import { GalleryRow, fetchGallery, mapGalleryRow } from '../lib/api/gallery';
import {
  ShiftRow,
  claimShift,
  fetchMyShiftSignups,
  fetchShifts,
  mapShiftRow,
  releaseShift
} from '../lib/api/shifts';
import { ProfileRow, fetchMyProfile, mapProfileRow, updateMyProfile } from '../lib/api/profile';
import { ServiceLogRow, fetchMyServiceLog } from '../lib/api/serviceLog';
import { createRsvp } from '../lib/api/rsvps';

/**
 * Raw database rows, kept alongside the mapped view models.
 *
 * Display labels (`event.date`, `shift.time`, `gallery.date`) are formatted
 * per-language from timestamps, so switching language has to re-map every
 * collection. Holding the rows makes that a pure recomputation instead of a
 * refetch.
 */
interface RawData {
  events: EventRow[];
  gallery: GalleryRow[];
  shifts: ShiftRow[];
  takenShiftIds: string[];
  profile: ProfileRow | null;
  /** Verified hours. Only ever non-empty for a signed-in volunteer. */
  serviceLog: ServiceLogRow[];
}

const EMPTY_RAW: RawData = {
  events: [],
  gallery: [],
  shifts: [],
  takenShiftIds: [],
  profile: null,
  serviceLog: []
};

interface DerivedData {
  events: PAWTXEvent[];
  gallery: GalleryItem[];
  shifts: Shift[];
  volunteer: VolunteerProfile | null;
}

function derive(raw: RawData, language: 'en' | 'es'): DerivedData {
  const takenIds = new Set(raw.takenShiftIds);
  const shifts = raw.shifts.map((row) => mapShiftRow(row, language, takenIds));

  return {
    events: raw.events.map((row) => mapEventRow(row, language)),
    gallery: raw.gallery.map((row) => mapGalleryRow(row, language)),
    shifts,
    // Hours come from the verified ledger, not from the shifts above — signing
    // up for one is not the same as having served it.
    volunteer: raw.profile ? mapProfileRow(raw.profile, raw.serviceLog, language) : null
  };
}

interface AppState {
  // Search
  isSearchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  toggleSearch: () => void;

  // Navigation & Language
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  language: 'en' | 'es';
  setLanguage: (lang: 'en' | 'es') => void;

  // Backend data
  raw: RawData;
  dataStatus: DataStatus;
  dataError: ActionError | null;
  initialize: () => Promise<void>;
  refreshContent: () => Promise<void>;

  // Events & RSVP
  events: PAWTXEvent[];
  selectedEventForRsvp: PAWTXEvent | null;
  openRsvpModal: (event: PAWTXEvent) => void;
  closeRsvpModal: () => void;
  submitRsvp: (data: {
    eventId: string;
    fullName: string;
    email: string;
    phone: string;
    guestCount: number;
    optionalDonation?: number;
    mediaConsent?: MediaConsent | null;
  }) => Promise<ActionResult>;

  // Gallery
  gallery: GalleryItem[];
  lightboxItemIndex: number | null;
  /**
   * Positions in `gallery` the arrows may step through. Set by the gallery to
   * whatever its filters left visible; null means the whole gallery, which is
   * what the search palette wants when it jumps straight to one photo.
   */
  lightboxScope: number[] | null;
  openLightbox: (index: number, scope?: number[]) => void;
  closeLightbox: () => void;
  nextLightbox: () => void;
  prevLightbox: () => void;

  // Volunteer Portal & Auth
  volunteer: VolunteerProfile | null;
  isLoggedIn: boolean;
  authStatus: DataStatus;
  shifts: Shift[];
  loginWithMagicLink: (email: string) => Promise<ActionResult>;
  loginWithGoogle: () => Promise<ActionResult>;
  logout: () => Promise<void>;
  toggleShiftBooking: (shiftId: string) => Promise<ActionResult>;
  saveProfile: (patch: { fullName: string; phone: string }) => Promise<ActionResult>;
}

/**
 * Guards `initialize()` against React 18 StrictMode, which mounts effects
 * twice in development and would otherwise double every initial request and
 * register two auth listeners.
 */
let initialized = false;

/**
 * Moves the lightbox one photo along, within whatever set it was opened over.
 *
 * The arrows used to step through `gallery` itself, so filtering to "Cooking"
 * and pressing right walked straight out of the filter and into a relief
 * drive. If the current photo is not in the scope — the filter changed while
 * the lightbox was open — start from the beginning of the scope rather than
 * getting stuck.
 */
function stepLightbox(
  state: Pick<AppState, 'lightboxItemIndex' | 'lightboxScope' | 'gallery'>,
  delta: 1 | -1
): Partial<AppState> {
  const { lightboxItemIndex, lightboxScope, gallery } = state;
  if (lightboxItemIndex === null || gallery.length === 0) return {};

  const scope =
    lightboxScope && lightboxScope.length > 0 ? lightboxScope : gallery.map((_, index) => index);

  const at = scope.indexOf(lightboxItemIndex);
  if (at === -1) return { lightboxItemIndex: scope[0] };

  return { lightboxItemIndex: scope[(at + delta + scope.length) % scope.length] };
}

export const useAppStore = create<AppState>((set, get) => ({
  // Search
  isSearchOpen: false,
  openSearch: () => set({ isSearchOpen: true }),
  closeSearch: () => set({ isSearchOpen: false }),
  toggleSearch: () => set((state) => ({ isSearchOpen: !state.isSearchOpen })),

  // Navigation & Language
  activeTab: 'home',
  setActiveTab: (tab) => {
    set({ activeTab: tab });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  language: 'en',
  setLanguage: (lang) => {
    i18n.changeLanguage(lang);
    // Re-map so every date and time label switches language with the UI.
    set({ language: lang, ...derive(get().raw, lang) });
  },

  // Backend data
  raw: EMPTY_RAW,
  dataStatus: 'idle',
  dataError: null,

  initialize: async () => {
    if (initialized) return;
    initialized = true;

    if (!isSupabaseConfigured() || !supabase) {
      set({ dataStatus: 'error', dataError: 'not_configured', authStatus: 'error' });
      return;
    }

    // Auth state drives the volunteer profile and the admin panel. Subscribing
    // before the first load means a magic-link callback (which the SDK parses
    // out of the URL on startup) is picked up in the same pass.
    supabase.auth.onAuthStateChange(async (event, session) => {
      // A magic link lands on the site root, and there is no router or signed-in
      // indicator in the header — so without this the visitor comes back from
      // their inbox to an apparently unchanged home page and assumes it failed.
      // SIGNED_IN fires only on a fresh sign-in; INITIAL_SESSION (restoring an
      // existing session on every page load) must not hijack navigation.
      if (event === 'SIGNED_IN') {
        set((state) => (state.activeTab === 'admin' ? {} : { activeTab: 'volunteer' }));
      }

      if (!session?.user) {
        set((state) => {
          // The ledger goes with the profile: leaving it behind would show the
          // previous volunteer's hours to whoever signs in next.
          const raw = { ...state.raw, profile: null, takenShiftIds: [], serviceLog: [] };
          return { isLoggedIn: false, authStatus: 'ready', raw, ...derive(raw, state.language) };
        });
        return;
      }

      const userId = session.user.id;

      try {
        const [profile, takenShiftIds, serviceLog] = await Promise.all([
          fetchMyProfile(userId),
          fetchMyShiftSignups(userId),
          fetchMyServiceLog(userId)
        ]);

        set((state) => {
          const raw = { ...state.raw, profile, takenShiftIds, serviceLog };
          return {
            isLoggedIn: true,
            authStatus: 'ready',
            raw,
            ...derive(raw, state.language)
          };
        });
      } catch (error) {
        reportError('Failed to load the signed-in volunteer profile', error);
        set({ isLoggedIn: true, authStatus: 'error' });
      }
    });

    await get().refreshContent();
  },

  refreshContent: async () => {
    set({ dataStatus: 'loading', dataError: null });

    try {
      const [events, gallery, shifts] = await Promise.all([
        fetchEvents(),
        fetchGallery(),
        fetchShifts()
      ]);

      set((state) => {
        const raw = { ...state.raw, events, gallery, shifts };
        return { raw, dataStatus: 'ready', dataError: null, ...derive(raw, state.language) };
      });
    } catch (error) {
      set({ dataStatus: 'error', dataError: reportError('Failed to load site content', error) });
    }
  },

  // Events & RSVP
  events: [],
  selectedEventForRsvp: null,
  openRsvpModal: (event) => set({ selectedEventForRsvp: event }),
  closeRsvpModal: () => set({ selectedEventForRsvp: null }),

  submitRsvp: async (data) => {
    try {
      await createRsvp({
        eventId: data.eventId,
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        guestCount: data.guestCount,
        optionalDonation: data.optionalDonation,
        mediaConsent: data.mediaConsent
      });
    } catch (error) {
      return { ok: false, error: reportError('RSVP failed', error) };
    }

    // The seat count now differs from what this browser holds. Re-read the
    // events rather than adding locally: another visitor may have booked in
    // between, and the modal's confirmation screen shows remaining spots.
    const seats = data.guestCount + 1;
    set((state) => {
      const events = state.raw.events.map((row) =>
        row.id === data.eventId
          ? { ...row, reserved_spots: Math.min(row.total_spots, row.reserved_spots + seats) }
          : row
      );
      const raw = { ...state.raw, events };
      return { raw, ...derive(raw, state.language) };
    });

    void get().refreshContent();
    return { ok: true };
  },

  // Gallery
  gallery: [],
  lightboxItemIndex: null,
  lightboxScope: null,
  openLightbox: (index, scope) => set({ lightboxItemIndex: index, lightboxScope: scope ?? null }),
  closeLightbox: () => set({ lightboxItemIndex: null, lightboxScope: null }),
  nextLightbox: () => set(stepLightbox(get(), 1)),
  prevLightbox: () => set(stepLightbox(get(), -1)),

  // Volunteer Portal & Auth
  volunteer: null,
  isLoggedIn: false,
  authStatus: 'idle',
  shifts: [],

  loginWithMagicLink: async (email) => {
    if (!supabase) return { ok: false, error: 'not_configured' };

    // Must exactly match an entry in Supabase → Authentication → URL
    // Configuration → Redirect URLs, including the GitHub Pages project path
    // in production. A mismatch does not fail — Supabase substitutes the Site
    // URL and the link arrives pointing somewhere else entirely.
    const redirectTo = getSiteUrl();
    warnIfRedirectLikelyUnlisted(redirectTo);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: redirectTo
      }
    });

    if (error) return { ok: false, error: reportError('Magic link request failed', error) };
    return { ok: true };
  },

  loginWithGoogle: async () => {
    if (!supabase) return { ok: false, error: 'not_configured' };

    // Same allowlist as the magic link, and the same silent substitution when
    // the address is missing from it.
    const redirectTo = getSiteUrl();
    warnIfRedirectLikelyUnlisted(redirectTo);

    // Sends no email at all, so it is unaffected by the Supabase Auth email
    // throttle that blocks magic links once a couple have gone out in an hour.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo
      }
    });

    // On success the browser has already been sent to Google; an error here
    // means the provider is not enabled or is misconfigured.
    if (error) return { ok: false, error: reportError('Google sign-in failed', error) };
    return { ok: true };
  },

  logout: async () => {
    await supabase?.auth.signOut();
    set((state) => {
      // serviceLog too: it is one volunteer's credited hours, and leaving it
      // behind would show them to whoever signs in next on this browser.
      const raw = { ...state.raw, profile: null, takenShiftIds: [], serviceLog: [] };
      return { isLoggedIn: false, raw, ...derive(raw, state.language) };
    });
  },

  /**
   * Lets a volunteer put their own name to their account.
   *
   * Magic-link sign-in supplies nothing but an email, so the portal greeted
   * people as "murok.roha@gmail.com" and, worse, a service letter would have
   * carried that too. Google sign-in fills the name in automatically, which is
   * why this went unnoticed.
   *
   * The row is re-read rather than patched locally: `role` and `badges` are not
   * writable here, and this keeps the store holding what the database actually
   * has rather than what the client hoped it wrote.
   */
  saveProfile: async ({ fullName, phone }) => {
    const userId = get().raw.profile?.id;
    if (!userId) return { ok: false, error: 'unauthenticated' };

    try {
      await updateMyProfile(userId, {
        full_name: fullName.trim() || null,
        phone: phone.trim() || null
      });

      const profile = await fetchMyProfile(userId);
      set((state) => {
        const raw = { ...state.raw, profile };
        return { raw, ...derive(raw, state.language) };
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: reportError('Failed to save the volunteer profile', error) };
    }
  },

  toggleShiftBooking: async (shiftId) => {
    const state = get();
    const userId = state.raw.profile?.id;
    if (!userId) return { ok: false, error: 'unauthenticated' };

    const isTaken = state.raw.takenShiftIds.includes(shiftId);
    const snapshot = state.raw;

    // Optimistic: the button should respond immediately, and the rollback
    // below restores the exact previous state if the write is rejected (a
    // full shift trips the shifts_not_overbooked constraint).
    set(() => {
      const takenShiftIds = isTaken
        ? snapshot.takenShiftIds.filter((id) => id !== shiftId)
        : [...snapshot.takenShiftIds, shiftId];

      const shifts = snapshot.shifts.map((row) =>
        row.id === shiftId
          ? { ...row, spots_filled: Math.max(0, row.spots_filled + (isTaken ? -1 : 1)) }
          : row
      );

      const raw = { ...snapshot, takenShiftIds, shifts };
      return { raw, ...derive(raw, state.language) };
    });

    try {
      if (isTaken) {
        await releaseShift(shiftId, userId);
      } else {
        await claimShift(shiftId, userId);
      }
      return { ok: true };
    } catch (error) {
      set((current) => ({ raw: snapshot, ...derive(snapshot, current.language) }));
      return { ok: false, error: reportError('Shift booking failed', error) };
    }
  }
}));
