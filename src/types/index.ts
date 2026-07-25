export type EventCategory = 'all' | 'cooking' | 'cultural' | 'seminars' | 'relief';

export interface PAWTXEvent {
  id: string;
  title: string;
  titleEs: string;
  description: string;
  descriptionEs: string;
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

export type ActiveTab = 'home' | 'events' | 'social' | 'gallery' | 'donate' | 'volunteer';

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
