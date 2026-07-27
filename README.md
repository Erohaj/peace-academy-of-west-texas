<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/20e5a058-8fc2-4ef6-bed7-2c6ff235286d

## Run Locally

**Prerequisites:** Node.js 18+, and Docker Desktop if you want the local Supabase stack.

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
3. `npm run dev`

Without those two variables the site loads but shows a "backend isn't connected"
banner — events, RSVPs, the volunteer portal and donations all come from Supabase.

## Backend setup

The site is static (GitHub Pages) and talks to **Supabase** directly from the
browser; anything needing a secret runs in a Supabase **Edge Function**.

### 1. Database

```bash
npx supabase link --project-ref <your-project-ref>
npm run db:push          # apply migrations to the remote project
npm run db:types         # regenerate src/lib/database.types.ts
```

Seed the starter content once, from the SQL editor or with
`npx supabase db reset --linked` (destructive — first time only).

Locally: `npm run db:start` then `npm run db:reset`. Outgoing email is captured
by Inbucket at <http://localhost:54324>.

### 2. Auth

Supabase → Authentication → URL Configuration → **Redirect URLs** must include
the deployed path, including the GitHub Pages sub-path:

```
https://<user>.github.io/peace-academy-of-west-texas/
http://localhost:3000
```

Magic links silently fail to return if this does not match.

### 3. Make yourself an admin

Sign in once through the Volunteer Portal to create your profile, then in the
Supabase SQL editor:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

A "Staff Admin" link then appears in the site footer.

### 4. Edge Function secrets

```bash
npx supabase secrets set \
  STRIPE_SECRET_KEY=sk_test_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  RESEND_API_KEY=re_... \
  MAIL_FROM="PAWTX <info@pawtx.org>" \
  CONTACT_INBOX=paowtx@gmail.com \
  SITE_URL=https://<user>.github.io/peace-academy-of-west-texas \
  ORG_EIN=XX-XXXXXXX

npm run functions:deploy
```

`ORG_EIN` must be the organization's real EIN. Until it is set, donation
receipts deliberately omit the tax-ID line rather than print a placeholder.

### 5. Stripe webhook

Add an endpoint in the Stripe dashboard pointing at
`https://<project>.supabase.co/functions/v1/stripe-webhook`, subscribed to
`checkout.session.completed`, `invoice.paid`, `checkout.session.expired` and
`charge.refunded`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.

Locally: `stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook`.

### 6. RSVP confirmation emails

Supabase → Database → Webhooks → Create: table `rsvps`, event `INSERT`, type
*Supabase Edge Functions*, function `send-rsvp-confirmation`.

### 7. Deployment

Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as **repository secrets**
(Settings → Secrets and variables → Actions). `deploy.yml` passes them to the
build; without them the published site has no backend.

## Search engines and shared links

What a crawler sees is baked into `index.html` at build time from
[src/lib/seo.ts](src/lib/seo.ts) — page description, the Open Graph and Twitter
card tags that render the preview when someone posts the link, the canonical
URL, the favicons, and `Organization` structured data (address, founding year,
501(c)(3) status, and the official social accounts).

The share card and favicons are committed under `public/`. Regenerate them from
the bundled photos after changing the hero or the logo:

```bash
npm run seo:assets
```

**If the site moves to its own domain,** change `SITE_ORIGIN` and `SITE_PATH`
in `src/lib/seo.ts` — everything else, including `robots.txt` and
`sitemap.xml`, is derived from them. Note that `robots.txt` only takes effect
once the site is at the root of a domain: crawlers read it at the origin root,
and GitHub Pages serves this project under `/peace-academy-of-west-texas/`.

After deploying a change to the preview card, ask each platform to re-read the
page — they cache the old one for days:
[Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/),
[X Post Inspector](https://cards-dev.twitter.com/validator),
[LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/),
[Google Rich Results Test](https://search.google.com/test/rich-results).

## Live Social Feed (Instagram + Facebook)

The "Social Feed" section shows curated mock posts until you connect real accounts.
[.github/workflows/fetch-social.yml](.github/workflows/fetch-social.yml) runs
[scripts/fetch-social-posts.mjs](scripts/fetch-social-posts.mjs) every 6 hours (and on manual
dispatch from the Actions tab), writes the results to `public/social-posts.json`, and commits
them — the push to `main` then triggers the existing deploy workflow to rebuild and republish.

To turn it on, add these as **repository secrets** (Settings → Secrets and variables → Actions):

- `FB_PAGE_ACCESS_TOKEN` — a long-lived Page access token from a Meta for Developers app
  (needs the `pages_read_engagement` permission; also used to read Instagram since it's
  fetched through the linked Page).
- `FB_PAGE_ID` — your Facebook Page ID.
- `IG_USER_ID` — the Instagram Business/Creator account ID, which must be linked to that
  same Facebook Page.

Until these secrets exist, the workflow simply skips the missing platform(s) and
`public/social-posts.json` stays empty, so the site keeps showing the mock posts.
