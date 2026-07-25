import { create } from 'zustand';
import { PAWTXEvent, RSVP, GalleryItem, Shift, VolunteerProfile, Donation, ActiveTab } from '../types';
import { INITIAL_EVENTS, INITIAL_GALLERY, INITIAL_SHIFTS, MOCK_VOLUNTEER } from '../data/mockData';
import i18n from '../i18n/config';

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

  // Events & RSVP
  events: PAWTXEvent[];
  rsvps: RSVP[];
  selectedEventForRsvp: PAWTXEvent | null;
  openRsvpModal: (event: PAWTXEvent) => void;
  closeRsvpModal: () => void;
  submitRsvp: (data: Omit<RSVP, 'id' | 'createdAt'>) => Promise<boolean>;

  // Gallery
  gallery: GalleryItem[];
  lightboxItemIndex: number | null;
  openLightbox: (index: number) => void;
  closeLightbox: () => void;
  nextLightbox: () => void;
  prevLightbox: () => void;

  // Volunteer Portal & Auth
  volunteer: VolunteerProfile | null;
  isLoggedIn: boolean;
  shifts: Shift[];
  loginWithMagicLink: (email: string) => Promise<boolean>;
  logout: () => void;
  toggleShiftBooking: (shiftId: string) => void;

  // Donations
  donations: Donation[];
  addDonation: (donation: Omit<Donation, 'id' | 'createdAt'>) => Promise<boolean>;
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
    set({ language: lang });
  },

  // Events & RSVP
  events: INITIAL_EVENTS,
  rsvps: [],
  selectedEventForRsvp: null,
  openRsvpModal: (event) => set({ selectedEventForRsvp: event }),
  closeRsvpModal: () => set({ selectedEventForRsvp: null }),
  submitRsvp: async (data) => {
    const newRsvp: RSVP = {
      ...data,
      id: `rsvp-${Date.now()}`,
      createdAt: new Date().toISOString()
    };

    set((state) => {
      // Optimistically update reserved spots
      const updatedEvents = state.events.map((evt) => {
        if (evt.id === data.eventId) {
          return {
            ...evt,
            reservedSpots: Math.min(evt.totalSpots, evt.reservedSpots + data.guestCount + 1)
          };
        }
        return evt;
      });

      return {
        rsvps: [newRsvp, ...state.rsvps],
        events: updatedEvents
      };
    });

    return true;
  },

  // Gallery
  gallery: INITIAL_GALLERY,
  lightboxItemIndex: null,
  openLightbox: (index) => set({ lightboxItemIndex: index }),
  closeLightbox: () => set({ lightboxItemIndex: null }),
  nextLightbox: () => {
    const { lightboxItemIndex, gallery } = get();
    if (lightboxItemIndex === null) return;
    const nextIdx = (lightboxItemIndex + 1) % gallery.length;
    set({ lightboxItemIndex: nextIdx });
  },
  prevLightbox: () => {
    const { lightboxItemIndex, gallery } = get();
    if (lightboxItemIndex === null) return;
    const prevIdx = (lightboxItemIndex - 1 + gallery.length) % gallery.length;
    set({ lightboxItemIndex: prevIdx });
  },

  // Volunteer Portal & Auth
  volunteer: null,
  isLoggedIn: false,
  shifts: INITIAL_SHIFTS,
  loginWithMagicLink: async (email) => {
    // Simulate instant login response
    set({
      isLoggedIn: true,
      volunteer: {
        ...MOCK_VOLUNTEER,
        email: email || MOCK_VOLUNTEER.email
      }
    });
    return true;
  },
  logout: () => {
    set({ isLoggedIn: false, volunteer: null });
  },
  toggleShiftBooking: (shiftId) => {
    set((state) => {
      let hoursDelta = 0;
      let shiftsCompletedDelta = 0;

      const updatedShifts = state.shifts.map((shift) => {
        if (shift.id === shiftId) {
          const newIsTaken = !shift.isTakenByMe;
          if (newIsTaken) {
            hoursDelta += shift.durationHours;
            shiftsCompletedDelta += 1;
          } else {
            hoursDelta -= shift.durationHours;
            shiftsCompletedDelta -= 1;
          }
          return {
            ...shift,
            isTakenByMe: newIsTaken,
            spotsFilled: newIsTaken ? shift.spotsFilled + 1 : shift.spotsFilled - 1
          };
        }
        return shift;
      });

      const updatedVolunteer = state.volunteer
        ? {
            ...state.volunteer,
            totalHours: Math.max(0, state.volunteer.totalHours + hoursDelta),
            shiftsCompleted: Math.max(0, state.volunteer.shiftsCompleted + shiftsCompletedDelta)
          }
        : null;

      return {
        shifts: updatedShifts,
        volunteer: updatedVolunteer
      };
    });
  },

  // Donations
  donations: [],
  addDonation: async (donationData) => {
    const newDonation: Donation = {
      ...donationData,
      id: `don-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    set((state) => ({
      donations: [newDonation, ...state.donations]
    }));
    return true;
  }
}));
