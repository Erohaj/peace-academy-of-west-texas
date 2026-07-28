import { EventCategory, GalleryCategory } from '../types';

/**
 * One decision about what a category looks like and what it is called.
 *
 * The calendar coloured its chips per category while the event grid, the
 * brochure cards and the gallery painted every chip olive, so the same event
 * was terracotta in one view of a tab and olive in the other. Worse, all four
 * rendered the raw enum — an English-speaking visitor read "cooking" and a
 * Spanish-speaking one read "cooking" as well.
 *
 * The colours are the calendar's ramp, which was the considered one; the
 * shades live in index.css as tokens rather than being spelled out here.
 */

const BADGE_CLASSES: Record<EventCategory | GalleryCategory, string> = {
  all: 'bg-graphite text-white border-black',
  cooking: 'bg-terracotta text-white border-terracotta-deep',
  cultural: 'bg-olive text-white border-olive-deep',
  seminars: 'bg-ochre text-white border-ochre-deep',
  relief: 'bg-rust text-white border-rust-deep'
};

export const categoryBadgeClass = (category: EventCategory | GalleryCategory): string =>
  BADGE_CLASSES[category] ?? BADGE_CLASSES.all;

/**
 * i18n key for the short badge label. The longer `events.*`/`gallery.*` keys
 * are the filter-button copy ("Cooking Classes") and are too long for a chip.
 */
export const categoryLabelKey = (category: EventCategory | GalleryCategory): string =>
  `categories.${category in BADGE_CLASSES ? category : 'all'}`;
