import { SocialPost } from '../types';

/**
 * Seed posts for the social feed. **Deliberately empty.**
 *
 * This used to hold six hand-written posts that stood in for the real thing
 * while the Meta integration was unfinished. They were invented — invented
 * captions, invented engagement counts, invented handles (`@pawtx_org`,
 * `@PeaceAcademyWestTexas`) that belong to nobody, and `postUrl`s like
 * `instagram.com/p/pawtx_cooking_aug2026` that lead nowhere. The section
 * renders them under a "LIVE SOCIAL STREAM" badge, so a visitor reads them as
 * the organisation's actual posts, and by the time the site moved to
 * pawtx.org some were advertising events that had already happened.
 *
 * Fabricated posts on a 501(c)(3)'s own domain are not a placeholder problem,
 * they are a credibility problem, so the feed now shows an honest empty state
 * until real posts arrive. `SocialMediaFeed.tsx` fills this from
 * `public/social-posts.json`, which the fetch-social workflow writes once
 * FB_PAGE_ACCESS_TOKEN, FB_PAGE_ID and IG_USER_ID exist as repo secrets — see
 * the README. Nothing has to change here for that to start working.
 *
 * If placeholder posts are ever wanted again, they belong behind an explicit
 * "sample content" label, never under the live badge.
 */
export const INITIAL_SOCIAL_POSTS: SocialPost[] = [];
