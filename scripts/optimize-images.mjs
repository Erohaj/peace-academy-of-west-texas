#!/usr/bin/env node
/**
 * Re-encodes the bundled PAWTX photos in src/assets to WebP at display-
 * appropriate dimensions.
 *
 * The originals came straight off a camera/phone (1600x1200-1920x1080, ~7.6 MB
 * total) but never render larger than a gallery card or the lightbox, so the
 * home page was downloading several megabytes of photos it immediately scaled
 * down — slow enough that images showed as broken placeholders for a long time.
 *
 * Usage:
 *   node scripts/optimize-images.mjs            # write .webp next to the .jpg
 *   node scripts/optimize-images.mjs --out DIR  # write to DIR instead
 */
import sharp from 'sharp';
import { readdirSync, statSync, mkdirSync, existsSync } from 'fs';
import { join, basename, extname } from 'path';

const SRC_DIR = 'src/assets';

// Longest-edge budget per image. Gallery cards render ~410 CSS px wide and the
// lightbox tops out near 600x720, so 1000 still covers those comfortably on a
// high-DPI screen. Past this point file size scales with resolution, not
// quality — dropping quality alone barely moves these detailed crowd photos.
const DEFAULT_MAX_EDGE = 1000;
const RULES = {
  // Full-bleed hero behind the masthead — needs to stay sharp across the viewport.
  'hero-parade': { maxEdge: 1600, quality: 70 },
  // Rendered at 48x48 in the navbar/footer; keep it crisp but small.
  logo: { maxEdge: 512, quality: 85 },
};

const SOURCE_EXTENSIONS = ['.jpg', '.jpeg', '.png'];

const outFlagIndex = process.argv.indexOf('--out');
const OUT_DIR = outFlagIndex !== -1 ? process.argv[outFlagIndex + 1] : SRC_DIR;

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const files = readdirSync(SRC_DIR).filter((f) =>
  SOURCE_EXTENSIONS.includes(extname(f).toLowerCase())
);

let before = 0;
let after = 0;

for (const file of files) {
  const name = basename(file, extname(file));
  const { maxEdge = DEFAULT_MAX_EDGE, quality = 70 } = RULES[name] ?? {};
  const inPath = join(SRC_DIR, file);
  const outPath = join(OUT_DIR, `${name}.webp`);

  const info = await sharp(inPath)
    .rotate() // honour EXIF orientation before we strip metadata
    .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
    .webp({ quality })
    .toFile(outPath);

  const originalBytes = statSync(inPath).size;
  before += originalBytes;
  after += info.size;

  const kb = (n) => `${Math.round(n / 1024)} KB`;
  console.log(
    `${file.padEnd(32)} ${kb(originalBytes).padStart(7)} -> ${kb(info.size).padStart(7)}` +
      `  (${info.width}x${info.height})`
  );
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
console.log(
  `\n${files.length} images: ${mb(before)} -> ${mb(after)} ` +
    `(${Math.round((1 - after / before) * 100)}% smaller)`
);
