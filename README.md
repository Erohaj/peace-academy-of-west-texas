<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/20e5a058-8fc2-4ef6-bed7-2c6ff235286d

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

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
