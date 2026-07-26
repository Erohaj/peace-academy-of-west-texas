#!/usr/bin/env node
// Pulls the latest Facebook Page posts and Instagram Business media via the
// Meta Graph API and writes them into public/social-posts.json in the
// SocialPost[] shape SocialMediaFeed already renders. Run on a schedule by
// .github/workflows/fetch-social.yml; committing the output triggers the
// existing deploy.yml (push to main) so the site republishes automatically.

import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const GRAPH_VERSION = 'v21.0';
const OUTPUT_PATH = path.resolve(process.cwd(), 'public/social-posts.json');

const {
  FB_PAGE_ID,
  FB_PAGE_ACCESS_TOKEN,
  IG_USER_ID,
  FB_PAGE_NAME = 'Peace Academy of West Texas',
  FB_PAGE_HANDLE = '@PeaceAcademyWestTexas',
  IG_HANDLE = '@pawtx_org',
  PAGE_AVATAR_URL = ''
} = process.env;

if (!FB_PAGE_ACCESS_TOKEN) {
  console.error('FB_PAGE_ACCESS_TOKEN is required (Instagram is also read through the linked Page token).');
  process.exit(1);
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
  const fields = 'message,created_time,permalink_url,full_picture,likes.summary(true),comments.summary(true),shares';
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${FB_PAGE_ID}/posts?fields=${fields}&limit=10&access_token=${FB_PAGE_ACCESS_TOKEN}`;
  const data = await fetchJson(url);

  return (data.data || [])
    .filter((post) => post.message)
    .map((post) => ({
      id: `fb-${post.id}`,
      platform: 'facebook',
      author: { name: FB_PAGE_NAME, handle: FB_PAGE_HANDLE, avatarUrl: PAGE_AVATAR_URL, verified: true },
      content: post.message,
      contentEs: post.message,
      mediaUrl: post.full_picture,
      mediaType: 'image',
      publishedAt: post.created_time,
      publishedAtRelative: '',
      publishedAtRelativeEs: '',
      likesCount: post.likes?.summary?.total_count ?? 0,
      commentsCount: post.comments?.summary?.total_count ?? 0,
      sharesCount: post.shares?.count ?? 0,
      postUrl: post.permalink_url,
      tags: extractTags(post.message),
      isLiked: false,
      isBookmarked: false,
      commentsList: []
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
    author: { name: FB_PAGE_NAME, handle: IG_HANDLE, avatarUrl: PAGE_AVATAR_URL, verified: true },
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
    tags: extractTags(media.caption),
    isLiked: false,
    isBookmarked: false,
    commentsList: []
  }));
}

async function main() {
  const [fbPosts, igPosts] = await Promise.all([
    fetchFacebookPosts().catch((err) => {
      console.error('Facebook fetch failed:', err.message);
      return [];
    }),
    fetchInstagramMedia().catch((err) => {
      console.error('Instagram fetch failed:', err.message);
      return [];
    })
  ]);

  const merged = [...fbPosts, ...igPosts].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  await writeFile(OUTPUT_PATH, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
  console.log(`Wrote ${merged.length} live posts to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
