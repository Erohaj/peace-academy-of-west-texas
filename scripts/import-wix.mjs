#!/usr/bin/env node
/**
 * Pulls the old Wix site (www.pawtx.org) into this repo so its content can be
 * migrated into Supabase and src/data without anyone retyping it.
 *
 * Wix has no "export site" button and never will — the page design is locked
 * inside their editor. What it does leave in the open is everything we actually
 * need: the sitemaps list every page, each event page carries a schema.org
 * JSON-LD block with name/date/location/image, the body copy is server-rendered
 * (so it survives a plain fetch, no browser required), and every photo sits on
 * static.wixstatic.com where stripping the /v1/fill/... transform off the URL
 * returns the full-resolution original.
 *
 * What this CANNOT reach, because it is behind the Wix dashboard login and not
 * on any public page: event registrations and guest lists, the Contacts/CRM
 * list, form submissions, and any draft or unpublished page. Those have to be
 * exported by hand from the Wix dashboard — the script prints where when it
 * finishes.
 *
 * Usage:
 *   node scripts/import-wix.mjs                 # pages + media into wix-export/
 *   node scripts/import-wix.mjs --no-media      # text and JSON only, much faster
 *   node scripts/import-wix.mjs --out DIR       # write somewhere else
 */
import { mkdirSync, writeFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';

const ORIGIN = 'https://www.pawtx.org';
const MEDIA_HOST = 'https://static.wixstatic.com/media';
const UA = 'PAWTX-content-migration (own-site export; +https://new.pawtx.org)';

const argv = process.argv.slice(2);
const OUT_DIR = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : 'wix-export';
const SKIP_MEDIA = argv.includes('--no-media');

// Wix sits behind Cloudflare and starts throttling well before this hurts; four
// at a time pulls the whole site in under a minute without tripping it.
const CONCURRENCY = 4;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, { binary = false, tries = 3 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
    } catch (error) {
      lastError = error;
      if (attempt < tries) await sleep(400 * attempt);
    }
  }
  throw lastError;
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        out[index] = await fn(items[index], index);
      } catch (error) {
        out[index] = { error: String(error?.message ?? error) };
      }
    }
  });
  await Promise.all(workers);
  return out;
}

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/**
 * Wix ships the copy inside the HTML, so tag-stripping is enough — but block
 * ends have to become newlines first or every page collapses to one long line.
 */
function extractText(html) {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    // Wix opens every page with a conditional comment the tag-stripper below
    // would otherwise leave behind as a stray "-->" on line one.
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|li|tr|section|header|footer|article)>/gi, '\n');
  return decodeEntities(stripped.replace(/<[^>]+>/g, ' '))
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function extractMeta(html) {
  const pick = (re) => {
    const match = html.match(re);
    return match ? decodeEntities(match[1]).trim() : null;
  };
  return {
    title: pick(/<title[^>]*>([\s\S]*?)<\/title>/i),
    description: pick(/<meta name="description" content="([^"]*)"/i),
    ogTitle: pick(/<meta property="og:title" content="([^"]*)"/i),
    ogDescription: pick(/<meta property="og:description" content="([^"]*)"/i),
    ogImage: pick(/<meta property="og:image" content="([^"]*)"/i),
  };
}

function extractJsonLd(html) {
  const blocks = [];
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(re)) {
    try {
      blocks.push(JSON.parse(match[1].trim()));
    } catch {
      // Wix occasionally emits a block with a trailing comma; skip it rather
      // than abort the page — the copy and the images still matter.
    }
  }
  return blocks;
}

/**
 * Both the original URL and the repeated filename at the tail of a transform
 * URL match here; the Set collapses them to one id.
 */
function extractMediaIds(html) {
  const ids = new Set();
  const re = /static\.wixstatic\.com\/media\/([A-Za-z0-9_~%.-]+\.(?:jpe?g|png|webp|gif|avif))/gi;
  for (const match of html.matchAll(re)) ids.add(match[1]);
  return [...ids];
}

function slugOf(url) {
  const path = new URL(url).pathname.replace(/^\/+|\/+$/g, '');
  return (path || 'home').replace(/[^A-Za-z0-9._-]+/g, '-');
}

function write(relativePath, contents) {
  const full = join(OUT_DIR, relativePath);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, contents);
  return full;
}

console.log(`Reading ${ORIGIN}/sitemap.xml`);
const index = await get(`${ORIGIN}/sitemap.xml`);
const childMaps = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

const urls = [];
for (const childMap of childMaps) {
  const xml = await get(childMap);
  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) urls.push(match[1].trim());
}
const uniqueUrls = [...new Set(urls)];
console.log(`${uniqueUrls.length} pages listed across ${childMaps.length} sitemaps\n`);

const pages = await mapPool(uniqueUrls, CONCURRENCY, async (url) => {
  const html = await get(url);
  const slug = slugOf(url);
  const text = extractText(html);
  const record = {
    url,
    slug,
    ...extractMeta(html),
    // Wix duplicates a page every time someone clicks "Duplicate" in the editor
    // and never cleans them up; flag them so the migration can ignore them.
    isWixDuplicate: /(^|-)copy-of-/.test(slug),
    jsonLd: extractJsonLd(html),
    mediaIds: extractMediaIds(html),
    textLength: text.length,
  };
  write(join('text', `${slug}.txt`), text);
  console.log(
    `  ${slug.padEnd(58)} ${String(text.length).padStart(6)} chars  ${record.mediaIds.length} images`
  );
  return record;
});

const ok = pages.filter((p) => p && !p.error);
const failed = pages.filter((p) => p && p.error);

// The JSON-LD Event blocks are the only fully structured thing Wix exposes, and
// they map almost field for field onto the events table.
const events = ok
  .flatMap((page) =>
    page.jsonLd
      .filter((block) => block['@type'] === 'Event')
      .map((block) => ({
        sourceUrl: page.url,
        slug: page.slug,
        name: decodeEntities(block.name ?? ''),
        description: decodeEntities(block.description ?? ''),
        startsAt: block.startDate ?? null,
        endsAt: block.endDate ?? null,
        status: (block.eventStatus ?? '').replace('https://schema.org/', '') || null,
        locationName: block.location?.name ?? null,
        address: block.location?.address ?? null,
        image: block.image?.url ?? null,
      }))
  )
  .sort((a, b) => String(b.startsAt).localeCompare(String(a.startsAt)));

const mediaIds = [...new Set(ok.flatMap((p) => p.mediaIds))];
const usedBy = {};
for (const page of ok) {
  for (const id of page.mediaIds) (usedBy[id] ??= []).push(page.slug);
}

let media = [];
if (SKIP_MEDIA) {
  console.log(`\nSkipping ${mediaIds.length} images (--no-media)`);
} else {
  console.log(`\nDownloading ${mediaIds.length} originals`);
  media = await mapPool(mediaIds, CONCURRENCY, async (id) => {
    const target = join(OUT_DIR, 'media', id);
    if (existsSync(target)) {
      return { id, bytes: statSync(target).size, usedBy: usedBy[id], cached: true };
    }
    // No /v1/fill/... transform: that path is what Wix resizes on the fly, and
    // the bare media URL is the untouched upload.
    const bytes = await get(`${MEDIA_HOST}/${id}`, { binary: true });
    write(join('media', id), bytes);
    return { id, bytes: bytes.length, usedBy: usedBy[id] };
  });
}

const downloaded = media.filter((m) => m && !m.error);
const totalBytes = downloaded.reduce((sum, m) => sum + (m.bytes || 0), 0);

write('pages.json', JSON.stringify(ok, null, 2));
write('events.json', JSON.stringify(events, null, 2));
write('media.json', JSON.stringify(downloaded, null, 2));

const duplicates = ok.filter((p) => p.isWixDuplicate).length;
console.log('\n' + '-'.repeat(64));
console.log(
  `pages     ${ok.length} saved${failed.length ? `, ${failed.length} FAILED` : ''} (${duplicates} are Wix "copy of" duplicates)`
);
console.log(`events    ${events.length} with structured JSON-LD`);
console.log(`media     ${downloaded.length}/${mediaIds.length} originals, ${(totalBytes / 1e6).toFixed(1)} MB`);
console.log(`output    ${OUT_DIR}/`);
if (failed.length) {
  console.log('\nFailed pages:');
  for (const f of failed) console.log(`  ${f.error}`);
}
console.log(`
Still only reachable from the Wix dashboard (log in as the site owner):
  Event registrations   Dashboard > Events > each event > Guest List > Export CSV
  Contacts / CRM        Dashboard > Contacts > More Actions > Export
  Form submissions      Dashboard > Forms & Submissions > Export
Nothing public exposes those, so this script cannot fetch them.`);
