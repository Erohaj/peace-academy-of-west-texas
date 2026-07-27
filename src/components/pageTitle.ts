/**
 * Heading level for sections that appear in two places.
 *
 * `EventFeed`, `Gallery`, `SocialMediaFeed` and `DonationWidget` each render
 * both as one band of the stacked home page — where `Hero` owns the only h1 —
 * and as the entire contents of their own tab, where nothing else can. Left at
 * h2 in both, every tab but home shipped without an h1 at all, which is what
 * axe reported and what a screen-reader user relies on to know where they are.
 *
 * Passing the level in beats detecting it: the component has no idea which
 * context it is in, and `activeTab` is the thing that actually decides.
 */
export interface PageTitleProps {
  /** True when this section is the whole page and its title is the h1. */
  asPageTitle?: boolean;
}

export const titleTag = (asPageTitle?: boolean): 'h1' | 'h2' => (asPageTitle ? 'h1' : 'h2');

/**
 * Level for the cards and sub-sections underneath that title.
 *
 * These have to move in step with it. Promoting only the section title turned
 * `h2 → h3` into `h1 → h3`, which skips a level — the heading outline is how a
 * screen-reader user navigates a page, and a gap in it reads as a missing
 * section rather than a card.
 */
export const subTitleTag = (asPageTitle?: boolean): 'h2' | 'h3' => (asPageTitle ? 'h2' : 'h3');
