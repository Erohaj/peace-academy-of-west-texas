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
| `VITE_DONATIONS_ENABLED` | **off** in `.env.example` and absent from `deploy.yml` — production shows the offline giving panel. On locally, which is how the hosted test mode is exercised without a live donate button |
| Stripe account | created; **test mode now wired end to end on the hosted project** (2026-10-09). A **bank account for payouts** is the only thing still outstanding for **live** mode |
| Hosted Edge Function secrets | all seven set: `STRIPE_SECRET_KEY` (test), `STRIPE_WEBHOOK_SECRET` (test), `SITE_URL`, `CONTACT_INBOX`, `RESEND_API_KEY`, `MAIL_FROM`, `ORG_EIN` |
| EIN | **82-4145937.** It existed all along — an organisation cannot hold 501(c)(3) status without one, so it was issued with the exemption, not waiting to be applied for. Confirmed against IRS Business Master File data: name and the Brentwood Dr address match exactly, ruling date 1 July 2019, status active, 990-EZ filed for 2023 and 2024 |
| Stripe webhook endpoint | `we_1UOnfRApOhsap1HPMzKsD8ID`, test mode, all four events, enabled |
| Supabase project | `zusgxrezbffxxhztggev`, linked |
| Local tooling | Docker, local Supabase stack and Stripe CLI 1.52 all verified working |

Until the flag is on, the donate tab shows the "by check / by email" panel with
the org's postal address. That is a real way to give, not a placeholder, so
there is no rush to flip the flag before the rest of this list is true.

## 1. The Stripe account itself

Test mode needs none of this — a Stripe account in test mode works immediately
and issues `sk_test_…` keys. **Live** mode is what needs:

- [x] Business details and the **EIN** — `82-4145937`
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
- [x] `ORG_EIN` — set to `82-4145937`. Receipts now carry the tax-ID line and
      tell the donor to keep the letter; before it was set they deliberately
      omitted the line rather than print a placeholder, and the webhook logged
      it every time
- [ ] `RESEND_API_KEY` — without it no receipt is sent. The webhook now leaves
      `receipt_sent_at` **unset** in that case, so the receipt is retried once
      the key exists instead of the row lying about a delivery

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform —
do not set them by hand.

## 3. Deploy the functions

```bash
npm run functions:deploy
```

- [x] All five deploy. The script already passes `--no-verify-jwt` to
      `stripe-webhook` and **only** to it: Stripe signs with its own scheme and
      sends no Supabase token, so with JWT verification on, every event is
      rejected before the function runs. The signature check inside the
      function is what authenticates the caller.

> **Do not skip this step because the secrets already took effect.** Secrets
> are read at runtime, so `supabase secrets set` changes behaviour with no
> deploy — which makes it very easy to believe the whole function is current.
> The *code* is whatever was last pushed. On 2026-10-09 the three donation
> functions were still the **27 July** build, three months and an entire
> `donation-flow-fixes` PR behind `main`, while `send-contact-message` and
> `send-rsvp-confirmation` were from August. The tell was `donation-status`
> returning no `receipt_sent_at` even though the source selects it; it read as
> a bug in the receipt logic and was really a stale deploy. `supabase
> functions list` prints the deployed date per function — check it before
> concluding anything from a test.

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

**A second run on 2026-10-09 repeated all of this against the hosted
project** — the deployed Edge Functions, the hosted database and the real
Resend account, rather than the local stack — and closed two of the four items
that were open:

- [x] A receipt email **arrives** and `receipt_sent_at` is stamped. Three
      payments, three receipts, all three confirmed in the `paowtx@gmail.com`
      inbox — so this is delivery, not just Resend accepting the message.
      `RESEND_API_KEY` had been on the hosted project since August; what had
      been missing all along was testing somewhere `sendEmail` could actually
      reach `api.resend.com`, which the local stack never could
- [x] Monthly gifts: a `subscription`-mode session, paid, lands a `paid` row
      with `stripe_subscription` set and a receipt stamped. **A renewal is
      still only proven by synthetic `invoice.paid`** — a real second cycle
      needs a Stripe test clock
- [x] A refund made through the Stripe API flips the row to `refunded`
      (`charge.refunded`, delivered by Stripe)

- [x] Cancel from Stripe's page back to `?donation=cancelled`, in two halves
      that meet: the Back link on Stripe's hosted page was read off the live
      page and points at `https://pawtx.org?donation=cancelled`, and loading
      that query string shows the "Payment Cancelled — no charge was made"
      banner above a form ready for another go, then rewrites the URL to
      `#donate` so a refresh does not replay the banner. Only Stripe's own
      redirect sits between the two, and it is Stripe following its own link

Deliberately **not** tested, by the owner's call (2026-10-10): the flow in
Spanish. The widget is fully translated and Spanish-speaking visitors get it
whether or not it was exercised here; the **receipt stays English-only**, which
is already how `stripe-webhook` is written — it has no language branch at all,
unlike `send-rsvp-confirmation`.

Still open:

- [ ] A real renewal cycle, via a Stripe test clock

## 8. Go live

- [ ] Swap in the `sk_live_…` key
- [ ] Create the webhook endpoint **again in live mode** and copy its
      *different* signing secret into `STRIPE_WEBHOOK_SECRET`
- [ ] Redeploy the functions
- [ ] Make one real donation with a real card, then refund it
- [ ] Confirm the payout lands in the bank account

---

## The receipt, both ways

`ORG_EIN` is what turns the acknowledgment into a tax document, and both
branches have now been seen as real delivered mail rather than read off the
source:

- **With the EIN** (what donors will get): headed "Official Donation Receipt",
  carries `Tax ID (EIN): 82-4145937`, and closes "No goods or services were
  provided in exchange for this contribution. Keep this receipt for your tax
  records." Organisation name, amount and the no-goods-or-services statement
  are the three things a written acknowledgment needs under Pub. 1771, so
  nothing has to be sent by hand afterwards.
- **Without it** (how it behaved until 2026-10-10): headed "Donation Summary",
  no tax-ID line, and the closing sentence promises a formal receipt to
  follow — which somebody then had to actually send.

If donations were ever taken while `ORG_EIN` was unset, those donors are owed
that follow-up letter by hand. None were: the flag has never been on in
production.
