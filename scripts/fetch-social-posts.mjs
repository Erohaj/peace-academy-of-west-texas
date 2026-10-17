#!/usr/bin/env node
// Pulls the latest Facebook Page posts and Instagram Business media via the
// Meta Graph API and writes them into public/social-posts.json in the
// SocialPost[] shape SocialMediaFeed already renders. Run on a schedule by
// .github/workflows/fetch-social.yml; committing the output triggers the
// existing deploy.yml (push to main) so the site republishes automatically.

import { access, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

// v21.0 was current when this was written and sunsets on 21 January 2027.
// Meta does not fail an expired version's calls -- it quietly serves them from
// the next one still supported, so an out-of-date constant does not break
// loudly, it changes behaviour silently. Pinned to a current version and
// overridable, so the next bump is an environment variable rather than a
// commit.
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v26.0';
const OUTPUT_PATH = path.resolve(process.cwd(), 'public/social-posts.json');
const MEDIA_DIR = path.resolve(process.cwd(), 'public/social-media');
// Relative to the site root; SocialMediaFeed prefixes BASE_URL.
const MEDIA_PUBLIC_PREFIX = 'social-media/';
const MEDIA_MAX_EDGE = 1000;

const {
  FB_PAGE_ID,
  FB_PAGE_ACCESS_TOKEN,
  IG_USER_ID,
  FB_PAGE_NAME = 'Peace Academy of West Texas',
  // These defaults were @PeaceAcademyWestTexas and @pawtx_org, which belong to
  // nobody — they were invented alongside the mock posts that used to fill this
  // feed. The real accounts are facebook.com/pawtx and instagram.com/paowtx;
  // src/data/orgLinks.ts is the source of truth for every channel URL. Getting
  // this wrong is quiet: the posts would be real and the byline under them
  // would not.
  FB_PAGE_HANDLE = '@pawtx',
  IG_HANDLE = '@paowtx',
  PAGE_AVATAR_URL = ''
} = process.env;

// Not configured is not the same as broken, and this runs on a six-hourly
// schedule: exiting non-zero turned "the Meta app does not exist yet" into a
// failed workflow run four times a day, every one of which mails the repository
// owner. Ninety-odd of those had accumulated before anyone connected the noise
// to its cause.
//
// Leaving early with a zero exit keeps the schedule armed — the moment the
// secret is added the next run picks it up — while the run stays green. Note
// this only catches a *missing* token: one that exists and is rejected still
// fails loudly further down, which is the case actually worth an email.
if (!FB_PAGE_ACCESS_TOKEN) {
  console.log(
    'FB_PAGE_ACCESS_TOKEN is not set — skipping the social feed refresh. ' +
      'Add it as a repository secret, with FB_PAGE_ID and IG_USER_ID, to turn ' +
      'this on. Until then the site shows an empty-feed notice and the links ' +
      'to the real channels; it no longer stands in invented posts.'
  );
  process.exit(0);
}

function extractTags(text = '') {
  return Array.from(new Set((text.match(/#[\p{L}0-9_]+/gu) || []).map((tag) => tag.slice(1)))).slice(0, 6);
}

async function fetchJson(url) {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || res.statusText);
  }
  return data;
}

async function fetchFacebookPosts() {
  if (!FB_PAGE_ID) return [];
  // reactions, not likes: against the real Page on v26.0, likes.summary(true)
  // with comments.summary(true) came back with 6 posts for limit=10 and every
  // comment count at 0, while this asked-for-counts-only form returned all 10
  // with the comment counts Facebook itself shows. Reactions are also what the
  // number under a Facebook post counts -- a heart or a laugh is not a like.
  // .limit(0) asks for the totals without the individual people.
  const fields =
    'message,created_time,permalink_url,full_picture,' +
    'reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares';
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${FB_PAGE_ID}/posts?fields=${fields}&limit=10&access_token=${FB_PAGE_ACCESS_TOKEN}`;
  const data = await fetchJson(url);

  return (data.data || [])
    .filter((post) => post.message)
    .map((post) => ({
      id: `fb-${post.id}`,
      platform: 'facebook',
      author: { name: FB_PAGE_NAME, handle: FB_PAGE_HANDLE, avatarUrl: PAGE_AVATAR_URL, verified: false },
      content: post.message,
      contentEs: post.message,
      mediaUrl: post.full_picture,
      mediaType: 'image',
      publishedAt: post.created_time,
      publishedAtRelative: '',
      publishedAtRelativeEs: '',
      likesCount: post.reactions?.summary?.total_count ?? 0,
      commentsCount: post.comments?.summary?.total_count ?? 0,
      sharesCount: post.shares?.count ?? 0,
      postUrl: post.permalink_url,
      tags: extractTags(post.message)
    }));
}

async function fetchInstagramMedia() {
  if (!IG_USER_ID) return [];
  const fields = 'caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count';
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${IG_USER_ID}/media?fields=${fields}&limit=10&access_token=${FB_PAGE_ACCESS_TOKEN}`;
  const data = await fetchJson(url);

  return (data.data || []).map((media) => ({
    id: `ig-${media.id}`,
    platform: 'instagram',
    author: { name: FB_PAGE_NAME, handle: IG_HANDLE, avatarUrl: PAGE_AVATAR_URL, verified: false },
    content: media.caption || '',
    contentEs: media.caption || '',
    mediaUrl: media.media_type === 'VIDEO' ? media.thumbnail_url : media.media_url,
    mediaType: media.media_type === 'VIDEO' ? 'video' : 'image',
    publishedAt: media.timestamp,
    publishedAtRelative: '',
    publishedAtRelativeEs: '',
    likesCount: media.like_count ?? 0,
    commentsCount: media.comments_count ?? 0,
    sharesCount: 0,
    postUrl: media.permalink,
    tags: extractTags(media.caption)
  }));
}

async function readPreviousPosts() {
  try {
    const posts = JSON.parse(await readFile(OUTPUT_PATH, 'utf-8'));
    return Array.isArray(posts) ? posts : [];
  } catch {
    return [];
  }
}

// Meta's image URLs are signed CDN links (scontent-*.fbcdn.net, with an `oe=`
// expiry in the query string) and stop resolving after a few days. Written
// into the JSON as they are, every photo in the feed would turn into a broken
// image the first time the refresh stopped running -- a revoked token, a
// paused schedule -- while the captions beside them stayed. So each image is
// copied into public/social-media/ once, as WebP at the size the cards
// actually render, and the post points at that copy.
//
// The file is named after the post id and never rewritten once it exists, so
// a refresh that only moves the like counts adds no binary churn to the repo.
async function localiseMedia(post, sharp) {
  if (!post.mediaUrl || !/^https?:\/\//.test(post.mediaUrl)) return post;

  const fileName = `${post.id.replace(/[^\w-]/g, '_')}.webp`;
  const filePath = path.join(MEDIA_DIR, fileName);
  const localUrl = `${MEDIA_PUBLIC_PREFIX}${fileName}`;

  try {
    await access(filePath);
    return { ...post, mediaUrl: localUrl };
  } catch {
    // Not downloaded yet.
  }

  try {
    const res = await fetch(post.mediaUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const original = Buffer.from(await res.arrayBuffer());
    // Same treatment as scripts/optimize-images.mjs gives the bundled photos:
    // a 1000px long edge is already more than a feed card or the lightbox
    // shows, and Instagram serves up to 1440.
    const webp = await sharp(original)
      .rotate()
      .resize(MEDIA_MAX_EDGE, MEDIA_MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    await writeFile(filePath, webp);
    return { ...post, mediaUrl: localUrl };
  } catch (err) {
    // The remote URL still works today; the next run retries the download.
    console.warn(`Could not store media for ${post.id} (${err.message}); keeping Meta's URL for now.`);
    return post;
  }
}

// Images belonging to posts that have dropped off the end of the feed. Without
// this public/social-media/ only ever grows, and every file in it ships with
// each deploy.
async function pruneMedia(posts) {
  const referenced = new Set(
    posts
      .map((post) => post.mediaUrl)
      .filter((url) => url && url.startsWith(MEDIA_PUBLIC_PREFIX))
      .map((url) => url.slice(MEDIA_PUBLIC_PREFIX.length))
  );
  const files = await readdir(MEDIA_DIR).catch(() => []);
  await Promise.all(
    files.filter((file) => !referenced.has(file)).map((file) => rm(path.join(MEDIA_DIR, file)))
  );
}

async function main() {
  const previous = await readPreviousPosts();
  const failures = [];

  // A platform whose fetch fails keeps the posts it had. This used to fall
  // back to an empty list, so one rejected token or one Graph outage wrote
  // `[]`, the workflow committed it, and the deploy emptied the feed on the
  // live site -- with the run still green, because the error was caught here.
  // Now the run is marked failed instead (below), which is what mails the
  // repository owner, and the site keeps showing the last good posts.
  const fetchPlatform = async (platform, label, fetcher) => {
    try {
      return await fetcher();
    } catch (err) {
      failures.push(`${label}: ${err.message}`);
      return previous.filter((post) => post.platform === platform);
    }
  };

  const [fbPosts, igPosts] = await Promise.all([
    fetchPlatform('facebook', 'Facebook', fetchFacebookPosts),
    fetchPlatform('instagram', 'Instagram', fetchInstagramMedia)
  ]);

  const merged = [...fbPosts, ...igPosts].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  // Imported here rather than at the top so the not-configured exit above
  // does not need node_modules -- sharp is a devDependency.
  const { default: sharp } = await import('sharp');
  await mkdir(MEDIA_DIR, { recursive: true });
  const posts = [];
  for (const post of merged) {
    posts.push(await localiseMedia(post, sharp));
  }
  await pruneMedia(posts);

  await writeFile(OUTPUT_PATH, JSON.stringify(posts, null, 2) + '\n', 'utf-8');
  console.log(`Wrote ${posts.length} live posts to ${OUTPUT_PATH}`);

  if (failures.length > 0) {
    for (const failure of failures) console.error(`Fetch failed -- ${failure}`);
    console.error('Kept the previous posts for the platform(s) above.');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
