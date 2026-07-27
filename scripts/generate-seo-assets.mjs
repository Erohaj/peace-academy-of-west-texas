#!/usr/bin/env node
/**
 * Generates the static image assets referenced from index.html's head:
 * the Open Graph share card and the favicon set.
 *
 * These live in public/ (copied verbatim into dist/) rather than src/assets/,
 * because a social crawler and a browser asking for the favicon both need a
 * stable, predictable filename — Vite's content hashing would break both.
 *
 * The outputs are committed. This script exists so they can be regenerated
 * from the same sources if the hero photo or the logo ever changes, not
 * because the build runs it.
 *
 * Usage:
 *   node scripts/generate-seo-assets.mjs
 */
import sharp from 'sharp';
import { mkdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';

const OUT_DIR = 'public';

// 1.91:1 is what Facebook, LinkedIn and X all document for a large share card,
// and 1200x630 is the smallest size none of them upscale.
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

/** Photo used for the share card. Cropped, never letterboxed — a card with
 *  bars reads as broken in a feed. */
const OG_SOURCE = 'src/assets/hero-parade.webp';

/** The shield badge. Sits on a wide white margin, which is dead space at
 *  32px, so it gets trimmed back to the artwork before resizing. */
const LOGO_SOURCE = 'src/assets/logo.webp';

const ICON_SIZES = [
  // Browser tab, bookmarks bar, and the Google search result favicon
  // (Google fetches 48px and above but renders small).
  { file: 'favicon-32.png', size: 32 },
  { file: 'favicon-96.png', size: 96 },
  // iOS home screen. Apple applies its own rounding and never composites over
  // transparency, so this one is deliberately flattened onto white.
  { file: 'apple-touch-icon.png', size: 180 },
  // Android home screen / PWA install, referenced from site.webmanifest.
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
];

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const kb = (n) => `${Math.round(n / 1024)} KB`;
const report = (file, info) =>
  console.log(
    `${file.padEnd(24)} ${`${info.width}x${info.height}`.padStart(9)}  ` +
      `${kb(statSync(join(OUT_DIR, file)).size).padStart(7)}`
  );

// --- Open Graph card -------------------------------------------------------

const ogInfo = await sharp(OG_SOURCE)
  .resize(OG_WIDTH, OG_HEIGHT, { fit: 'cover', position: 'centre' })
  // JPEG rather than WebP: every crawler has handled JPEG for a decade, while
  // WebP support across link-preview scrapers is still uneven.
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile(join(OUT_DIR, 'og-image.jpg'));

report('og-image.jpg', ogInfo);

// --- Favicons --------------------------------------------------------------

// threshold 12 keeps the trim from eating the pale outer edge of the shield.
const trimmedLogo = await sharp(LOGO_SOURCE).trim({ threshold: 12 }).toBuffer();

for (const { file, size } of ICON_SIZES) {
  // A few pixels of breathing room so the shield does not touch the edge of
  // the tab icon, then flattened onto white — the badge is drawn for a light
  // background and its blue outline disappears against a dark one.
  const padding = Math.max(1, Math.round(size * 0.06));

  const info = await sharp(trimmedLogo)
    .resize(size - padding * 2, size - padding * 2, {
      fit: 'contain',
      background: '#ffffff',
    })
    .extend({
      top: padding,
      bottom: padding,
      left: padding,
      right: padding,
      background: '#ffffff',
    })
    .flatten({ background: '#ffffff' })
    .png({ compressionLevel: 9 })
    .toFile(join(OUT_DIR, file));

  report(file, info);
}
