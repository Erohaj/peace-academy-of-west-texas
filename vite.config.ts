import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';
import {
  CANONICAL_URL,
  OG_IMAGE_ALT,
  OG_IMAGE_URL,
  organizationJsonLd,
  robotsTxt,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_PATH,
  SITE_TITLE,
  sitemapXml,
  THEME_COLOR,
  X_HANDLE,
} from './src/lib/seo';

/** Values substituted for `%NAME%` placeholders in index.html. */
const HTML_VALUES: Record<string, string> = {
  SITE_TITLE,
  SITE_NAME,
  SITE_DESCRIPTION,
  CANONICAL_URL,
  OG_IMAGE_URL,
  OG_IMAGE_ALT,
  THEME_COLOR,
  X_HANDLE,
};

/** SITE_DESCRIPTION contains an ampersand, which is not legal raw inside an
 *  attribute — browsers cope, stricter link-preview parsers need not. */
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Fills in the crawler-visible head of index.html and emits the files that
 * have to sit next to it.
 *
 * All of it comes from src/lib/seo.ts, so the canonical URL and the share
 * text are written once and not copied across five tags, a manifest and a
 * sitemap. See that module for why these tags cannot be left to `<Helmet>`.
 */
const pawtxSeo = (): Plugin => ({
  name: 'pawtx-seo',
  transformIndexHtml(html) {
    return html
      .replace(/%([A-Z_]+)%/g, (match, key: string) =>
        key in HTML_VALUES ? escapeHtml(HTML_VALUES[key]) : match
      )
      .replace(
        '%ORG_JSONLD%',
        // `<` cannot appear raw inside a script element; there is none in this
        // data today, but a future address or description could carry one.
        JSON.stringify(organizationJsonLd(), null, 2).replace(/</g, '\\u003c')
      );
  },
  generateBundle() {
    const emit = (fileName: string, source: string) =>
      this.emitFile({type: 'asset', fileName, source});

    // Emitted rather than kept in public/ so the canonical URL inside them
    // stays tied to src/lib/seo.ts. site.webmanifest cannot be done this way:
    // index.html links to it, and Vite resolves link hrefs against public/ at
    // transform time, before anything is emitted.
    emit('robots.txt', robotsTxt());
    emit('sitemap.xml', sitemapXml(new Date()));
  },
});

export default defineConfig(({ command }) => {
  return {
    // GitHub Pages serves project sites under /<repo>/. Use the repo path for
    // production builds, but keep dev/preview at root.
    base: command === 'build' ? SITE_PATH : '/',
    plugins: [react(), tailwindcss(), pawtxSeo()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
