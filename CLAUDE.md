# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Single-page marketing/engagement site for **Peace Academy of West Texas (PAWTX)**, a nonprofit in Odessa/Midland, TX. React 19 + Vite 6 + TypeScript + Tailwind CSS v4, with a **Supabase backend** (Postgres + Auth + Storage + Edge Functions) and **Stripe Checkout** for donations. Scaffolded from Google AI Studio (see `metadata.json`, `README.md`).

## Commands

```bash
npm install        # Node >= 18 required (Vite 6)
npm run dev        # dev server on http://localhost:3000 (host 0.0.0.0)
npm run build      # production build to dist/
npm run preview    # serve the built dist/
npm run lint       # tsc --noEmit — TYPE CHECK ONLY, the sole automated gate
npm run seo:assets # regenerate public/og-image.jpg and the favicons

npm run db:start   # local Supabase stack (needs Docker Desktop running)
npm run db:reset   # re-run migrations + supabase/seed.sql
npm run db:push    # apply migrations to the linked remote project
npm run db:types   # regenerate src/lib/database.types.ts from the live schema
npm run functions:serve   # Edge Functions locally
npm run functions:deploy  # deploy all five (stripe-webhook gets --no-verify-jwt)
```

There is **no test framework** — `npm run lint` is the only automated check. Run it before considering any change done. Note that `tsconfig.json` does **not** enable `strict`; in particular `strictNullChecks` is off, so TypeScript will not narrow a union by a boolean discriminant (this is why `ActionResult`'s success branch declares `error?: undefined`). `tsconfig.json` excludes `supabase/` because Edge Functions are Deno modules that import from `https://` URLs.

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which runs `npm run build` and publishes `dist/` to GitHub Pages. `vite.config.ts` sets `base: '/peace-academy-of-west-texas/'` only when `command === 'build'` (root `/` for dev/preview) — do not hardcode either path in app code; use relative asset imports/`import.meta.env.BASE_URL` if an absolute base path is ever needed.

## Architecture

**No router.** The whole app is state-driven from one Zustand store; the backend is Supabase, called directly from the browser.

- **Navigation** is a single `activeTab` field (`'home' | 'events' | 'social' | 'gallery' | 'donate' | 'volunteer' | 'admin'`) in `src/store/useAppStore.ts`. `App.tsx` conditionally renders sections from it — `home` stacks several sections; other tabs render one. To add a "page": extend the `ActiveTab` type in `src/types/index.ts` and add a branch in `App.tsx`. Nav lives in `Navbar`/`Footer`, which call `setActiveTab`.

- **Backend layout.** `supabase/migrations/` holds the schema (`*_init_schema.sql`), the RLS policies and the `create_rsvp` function (`*_rls_and_rpc.sql`), and the Storage bucket (`*_storage.sql`). `supabase/seed.sql` carries the former `mockData.ts` content. `supabase/functions/` holds five Deno Edge Functions: `create-checkout-session`, `stripe-webhook`, `donation-status`, `send-contact-message`, `send-rsvp-confirmation`.

- **RLS is the only security boundary.** The site is a static bundle on GitHub Pages, so the anon key ships to every visitor and the browser talks to PostgREST directly. Anything not explicitly denied by a policy is public. `rsvps`, `donations` and `contact_messages` have **no** public `select`; `events`, `gallery_items` and `shifts` are readable when `published`. Writes to content tables require `profiles.role = 'admin'`, checked via the `is_admin()` SECURITY DEFINER helper (a policy on `profiles` that queried `profiles` directly would recurse). Column privileges — not policies — are what stop a user setting their own `role`, and what stop an admin clobbering `events.reserved_spots`.

- **State** lives in `useAppStore`, which holds both the raw database rows (`raw.events`, `raw.shifts`, …) and the mapped view models. Display labels are language-dependent, so `setLanguage` re-runs `derive()` over the stored rows rather than refetching. `initialize()` loads content and subscribes to auth; it is guarded by a module-level flag against StrictMode's double effect.

- **Data access** is `src/lib/api/*` — one module per table, mapping snake_case rows to the camelCase types in `src/types/index.ts`. Actions return `ActionResult` (`{ok:true}` / `{ok:false, error}`) rather than a bare boolean, so the UI can distinguish "event full" from "already registered" from a network failure. `src/lib/api/errors.ts` maps the custom SQLSTATEs (`PA001`–`PA004`) raised by `create_rsvp` onto those codes.

- **RSVP capacity** is enforced by `create_rsvp()`, which takes a `FOR UPDATE` lock on the event row. Direct inserts into `rsvps` are revoked from anon and authenticated — the RPC is the only way in. Never re-add a client-side seat check; two simultaneous submissions cannot see each other's pending writes.

- **Payments.** The donation form has **no card field, deliberately** — collecting a card number in the page would put the site in PCI scope. `createCheckoutSession` calls an Edge Function that validates the amount server-side and returns a hosted Stripe URL; the browser navigates there. Stripe returns to `?donation=success&session_id=…`, which `App.tsx` reads (no router) and routes to the donate tab. The `stripe-webhook` function is the only writer that marks a donation `paid`, and it must be deployed with `--no-verify-jwt`. Donation receipts omit the tax-ID line unless `ORG_EIN` is set — printing a placeholder EIN would forge a tax document.

- **Images** come from two places, resolved by `resolveImage()` in `src/lib/api/images.ts`: photos bundled in `src/assets/*.webp` are content-hashed by Vite, so the database stores an `image_key` naming an entry in the `IMAGES` registry; admin uploads go to the `media` Storage bucket and store an absolute `image_url`, which wins when both are present.

- **`src/data/mockData.ts` is now only the `IMAGES` registry** despite its name — events, gallery, shifts and the volunteer profile moved to Postgres. `src/data/socialPosts.ts` is still genuinely mock data.

- **Live social feed** — `SocialMediaFeed` fetches `public/social-posts.json` on mount and, if it has entries, merges them (real Instagram + Facebook posts) with the still-mocked YouTube/X entries from `INITIAL_SOCIAL_POSTS`; on fetch failure/empty it falls back to the full mock set. That JSON is generated by `scripts/fetch-social-posts.mjs` via Meta Graph API calls, run on a schedule by `.github/workflows/fetch-social.yml` (needs `FB_PAGE_ACCESS_TOKEN`/`FB_PAGE_ID`/`IG_USER_ID` repo secrets — see README). The workflow commits the refreshed JSON to `main`, which triggers `deploy.yml` to rebuild/republish — this is still a fully static site, no live backend. Relative post ages (`formatRelativeTime` in `src/lib/relativeTime.ts`) are computed at render time from `publishedAt` rather than trusting baked `publishedAtRelative` strings, since the JSON only refreshes every few hours.

- **Adding a bundled image:** drop the source `.jpg` in `src/assets/`, run `npm run optimize:images` to convert it to WebP, delete the `.jpg`, then `import` the `.webp` in `mockData.ts` and assign it a key in `IMAGES`. Reference it from a database row by putting that key in `image_key`. This requires `src/vite-env.d.ts` (`/// <reference types="vite/client" />`) — without it, `tsc` fails on image imports.

- **Image pipeline** — `scripts/optimize-images.mjs` (sharp, a devDependency) resizes `src/assets/*.jpg` to a 1000px long edge (1600 for the hero, 512 for the logo) and re-encodes to WebP, which took the bundled photos from 7.5 MB to 2.5 MB. Straight-from-camera photos are far larger than anything the UI renders, so never commit one unprocessed. That script only touches build-time assets — admin uploads are resized in the browser by `resizeImageFile()` in `src/lib/api/admin.ts` (canvas → WebP, 1600px long edge) before they reach Storage, for the same reason. Only the hero is eager (`fetchPriority="high"`); every other `<img>` is `loading="lazy"`, which keeps the initial home-page load to ~3 images instead of ~25.

- **Dates** — the database stores real `timestamptz`; the human labels (`event.date`, `event.time`, `gallery.date`) are derived per-language in `src/lib/formatEventDate.ts` and pinned to `America/Chicago`, so "6:30 PM" always means 6:30 PM at the venue. `wallClockToInstant` / `instantToWallClock` convert for the admin panel's `datetime-local` inputs and handle DST correctly. Do not reintroduce human date strings in stored data.

- **i18n (bilingual EN/ES)** — `src/i18n/config.ts` holds **all** translations inline in one `resources` object. Two patterns coexist: (1) keyed strings via `useTranslation()` `t('...')`; (2) inline `isEs`/`language === 'es'` ternaries reading parallel data fields (`titleEs`, `descriptionEs`, `captionEs`, `roleEs`). `BrochureShowcase` is fully pattern (2). The store's `setLanguage` calls `i18n.changeLanguage` and sets `language`; components read `language` from the store, not just from i18next. Any new user-facing string must be handled in both languages.

- **Styling** — Tailwind v4 via the `@tailwindcss/vite` plugin. **There is no `tailwind.config.js`**: the theme (brand colors, fonts, radii) is declared in `src/index.css` inside `@theme`. Brand palette: terracotta `#A64D32`, olive `#5B6346`, parchment `#FDFBF7`, aged-paper `#F4F1ED`, graphite `#2A2A2A`; fonts Playfair Display (serif/headings) + Inter (sans). The custom classes `animate-fadeIn`, `animate-scaleUp`, `animate-shimmer`, and `scrollbar-none`/`no-scrollbar` are **hand-written plain CSS** at the bottom of `index.css` — they are NOT Tailwind built-ins. If you use a new `animate-*` class, define its `@keyframes` in `index.css` or it silently does nothing.

- **Head metadata is static, and has to be.** No link-preview crawler (Facebook, X, WhatsApp, LinkedIn, iMessage, Slack) runs JavaScript, so anything the bundle adds to `<head>` is invisible to them. `index.html` therefore carries the whole crawler-facing set — description, Open Graph, Twitter card, canonical, icons, and the `Organization` JSON-LD — with `%TOKEN%` placeholders filled in at build time by the `pawtxSeo()` plugin in `vite.config.ts` from **`src/lib/seo.ts`**, which is the single source of truth (and where `CANONICAL_URL` lives; changing domain means editing it and `SITE_PATH`, which is also the Vite `base`). The same plugin emits `robots.txt` and `sitemap.xml`; `site.webmanifest` cannot be emitted that way because `index.html` links to it and Vite resolves link hrefs against `public/` before anything is emitted. Its icon paths are relative on purpose so they survive the Pages sub-path. Never write a literal `</head>` inside an `index.html` comment — Vite injects the bundle before the first one it finds and will bury the whole app in the comment.

- **Do not render head tags from React.** `react-helmet-async` was removed: on React 19 it hoists tags natively rather than adopting the ones already in the document, so every `<meta>` it repeated from `index.html` appeared in the page twice. `App.tsx` sets `document.title` and `document.documentElement.lang` in a plain effect instead. Per-tab descriptions and `og:` tags were dropped rather than fixed — with no router the whole site is one URL, so there is nothing for a second description to be indexed as, and a shared link always resolves to the home page.

- **Scroll reveal** — wrap sections in `AnimatedSection` (IntersectionObserver toggles transition classes on visibility). Used pervasively on the home page.

- **Modals** are mounted once at the `App` root and toggled by store flags: `RSVPModal` (`selectedEventForRsvp`), `SearchModal` (`isSearchOpen`, global ⌘K/Ctrl+K listener; indexes events + gallery + shifts), `ContactModal` (local `App` state). Gallery uses a lightbox driven by `lightboxItemIndex` in the store.

- **Error handling** — the `ErrorBoundary` class component wraps both the root (`main.tsx`) and the main content region (`App.tsx`).

- **Optional Gemini AI** — `SocialMediaFeed`'s "AI summary" **lazily** `import('@google/genai')` only when an API key exists (guarded `process.env.API_KEY`, falling back to `import.meta.env.VITE_API_KEY`); with no key it shows a hardcoded fallback summary. Keep this lazy — a static import pulls the heavy SDK into the initial bundle.

## Conventions & gotchas

- `@/*` path alias maps to the project root (`./*`) in both `tsconfig.json` and `vite.config.ts`.
- Do not touch the `server.hmr` / `server.watch` logic in `vite.config.ts` — it is gated on `DISABLE_HMR` for the AI Studio agent environment.
- `2.png`-style large source photos must go through `npm run optimize:images` before bundling — a bundled photo should be ~100-200 KB, not multiple MB.
- The files in `public/` are served under fixed names on purpose — a crawler asking for `og-image.jpg` and a browser asking for the favicon both need a URL that does not change, which content-hashed `src/assets/` imports cannot give them. Regenerate with `npm run seo:assets` and commit the result; the build does not run it.
- **Never give a secret a `VITE_` prefix.** Vite inlines those into the public bundle. Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` belong there (both are public by design). Stripe, Resend and the service role key live in Edge Function secrets (`supabase secrets set`), and the same two `VITE_` vars must exist as GitHub Actions secrets or the deployed build has no backend.
- Auth magic links and Stripe return URLs must include the GitHub Pages project path (`/peace-academy-of-west-texas/`) and be listed in Supabase → Authentication → URL Configuration → Redirect URLs. `getSiteUrl()` in `supabaseClient.ts` derives it from `import.meta.env.BASE_URL`; a mismatch fails silently at click time.
- After changing a migration, run `npm run db:types` so `src/lib/database.types.ts` matches. It is currently hand-written and will drift otherwise.
