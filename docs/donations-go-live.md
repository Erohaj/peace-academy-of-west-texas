# Taking donations: what is left before a real dollar can arrive

Every line of the donation path is written and type-checks. Nothing on this
list is code — it is the account setup, the secrets and the one build flag that
stand between the finished code and a working donate button.

The order matters: the flag at step 6 is the last thing to flip, because it is
the only step a visitor can see.

---

## 0. Where things stand today

| | State |
|---|---|
| Widget, Edge Functions, `donations` table, RLS | written, `npm run lint` clean |
| `VITE_DONATIONS_ENABLED` | **off** in `.env.local`, in `.env.example`, and absent from `deploy.yml` — production shows the offline giving panel |
| Stripe account | created; sandbox keys work. EIN and a bank account still outstanding for **live** mode |
| Supabase project | `zusgxrezbffxxhztggev`, linked |
| Local tooling | Docker, local Supabase stack and Stripe CLI 1.52 all verified working |

Until the flag is on, the donate tab shows the "by check / by email" panel with
the org's postal address. That is a real way to give, not a placeholder, so
there is no rush to flip the flag before the rest of this list is true.

## 1. The Stripe account itself

Test mode needs none of this — a Stripe account in test mode works immediately
and issues `sk_test_…` keys. **Live** mode is what needs:

- [ ] Business details and the **EIN**
- [ ] A **bank account** for payouts
- [ ] Stripe's own identity verification cleared

Do every step below in test mode first. Test and live mode have **separate API
keys and separate webhook signing secrets** — nothing carries over.

## 2. Edge Function secrets

```bash
npx supabase secrets set \
  STRIPE_SECRET_KEY=sk_test_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  SITE_URL=https://pawtx.org,http://localhost:3000 \
  ORG_EIN=XX-XXXXXXX \
  RESEND_API_KEY=re_... \
  MAIL_FROM="PAWTX <info@pawtx.org>" \
  CONTACT_INBOX=paowtx@gmail.com
```

- [ ] `STRIPE_SECRET_KEY` — without it `create-checkout-session` returns
      "Payments are not configured" (500)
- [ ] `STRIPE_WEBHOOK_SECRET` — without it the webhook returns 500 and **no
      donation is ever marked paid**
- [ ] `SITE_URL` — **the first entry is the fallback return address.** It is a
      comma-separated list so localhost can be tested without shipping it; put
      production first or a donor who pays is returned to a dead address
      (`pickReturnUrl()` in `create-checkout-session/index.ts`)
- [ ] `ORG_EIN` — until set, receipts deliberately omit the tax-ID line rather
      than print a placeholder, and the webhook logs it every time
- [ ] `RESEND_API_KEY` — without it no receipt is sent. The webhook now leaves
      `receipt_sent_at` **unset** in that case, so the receipt is retried once
      the key exists instead of the row lying about a delivery

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform —
do not set them by hand.

## 3. Deploy the functions

```bash
npm run functions:deploy
```

- [ ] All five deploy. The script already passes `--no-verify-jwt` to
      `stripe-webhook` and **only** to it: Stripe signs with its own scheme and
      sends no Supabase token, so with JWT verification on, every event is
      rejected before the function runs. The signature check inside the
      function is what authenticates the caller.

## 4. The Stripe webhook endpoint

In the Stripe dashboard → Developers → Webhooks → Add endpoint:

- [ ] URL: `https://zusgxrezbffxxhztggev.supabase.co/functions/v1/stripe-webhook`
- [ ] Events — all four, each one is handled:
      `checkout.session.completed`, `invoice.paid`,
      `checkout.session.expired`, `charge.refunded`
- [ ] Copy the endpoint's **signing secret** into `STRIPE_WEBHOOK_SECRET`
      (step 2) and redeploy

Locally instead, with the Stripe CLI:

```bash
stripe listen --api-key sk_test_... \
  --events checkout.session.completed,invoice.paid,checkout.session.expired,charge.refunded \
  --forward-to localhost:54321/functions/v1/stripe-webhook
```

`--events` is mandatory from CLI 1.52 on. `--api-key` avoids the browser
`stripe login` round trip. The command prints a `whsec_…` of its own — use
*that* as `STRIPE_WEBHOOK_SECRET` while forwarding, not the dashboard
endpoint's secret, and expect it to change on every run.

## 5. Supabase redirect URLs

Supabase → Authentication → URL Configuration → Redirect URLs:

- [ ] `https://pawtx.org/**`
- [ ] `http://localhost:3000/**`

A mismatch fails silently at click time — Supabase substitutes the project's
Site URL rather than returning an error.

## 6. Flip the flag — last

- [ ] `.env.local`: `VITE_DONATIONS_ENABLED="true"` (already set locally)
- [ ] `.github/workflows/deploy.yml`, in the build step's `env:` block next to
      `VITE_EMAIL_ENABLED`:

      ```yaml
      VITE_DONATIONS_ENABLED: 'true'
      ```

      **Production stays off without this line**, whatever `.env.local` says —
      Vite inlines the flag at build time and CI has its own environment. It
      lives in plain sight rather than in repo secrets so that what production
      was built with is readable from the repository.
- [ ] `.env.example`: uncomment the flag so the next person sees it

## 7. Prove it end to end, in test mode

**A full run against Stripe's sandbox has been completed.** A real $100 payment
was made with card `4242 4242 4242 4242` on Stripe's own hosted page and
followed through to the database, then refunded. What follows is what that run
and the earlier synthetic-event run between them established:

- [x] Checkout opens on Stripe's hosted page with the right amount, product
      name and prefilled email
- [x] A `pending` row appears as soon as Checkout opens, before payment — a
      donation is never invisible
- [x] Paying flips the row to `paid` and records the payment intent, driven by
      a `checkout.session.completed` **delivered by Stripe**, not a replay
- [x] The thank-you screen shows the confirmed amount and donor read back from
      the database, and lands on the donate tab rather than the home page
- [x] Refunding in Stripe sends `charge.refunded` and the row becomes
      `refunded`
- [x] `receipt_sent_at` stays **NULL** when no mail went out
- [x] The webhook refuses a wrong signature and a missing one (400)
- [x] `checkout.session.expired` → `failed`; `invoice.paid` with
      `billing_reason: subscription_cycle` inserts a separate `paid` row
- [x] `create-checkout-session` refuses amounts below $1 and above $50,000 and
      never passes a foreign return URL through to Stripe
- [x] `donation-status` returns `receipt_sent_at`, withholds `donor_email` and
      rejects a malformed session id
- [x] A still-`pending` row shows "payment is still going through" and prints
      **no** receipt; all three receipt lines render from the right condition

Still open, and each needs something we do not have yet:

- [ ] A receipt email arrives and `receipt_sent_at` **is** stamped. Only the
      unstamped half is proven; the stamped half needs a real `RESEND_API_KEY`,
      because `sendEmail` posts to `api.resend.com` and cannot be pointed at a
      local inbox
- [ ] Monthly gifts end to end on the real Stripe side, including a renewal
- [ ] Both languages: the whole flow in Spanish
- [ ] Cancel from Stripe's page back to `?donation=cancelled` (the screen
      itself is verified; the trip back from Stripe is not)

## 8. Go live

- [ ] Swap in the `sk_live_…` key
- [ ] Create the webhook endpoint **again in live mode** and copy its
      *different* signing secret into `STRIPE_WEBHOOK_SECRET`
- [ ] Redeploy the functions
- [ ] Make one real donation with a real card, then refund it
- [ ] Confirm the payout lands in the bank account

---

## What cannot be tested until the EIN exists

`ORG_EIN` is what puts the tax-ID line on a donation receipt. Until it is set,
receipts go out without it and say a formal receipt will follow — which is
true, and which somebody then has to actually send. Donors who give before the
EIN is configured will need that follow-up by hand.
