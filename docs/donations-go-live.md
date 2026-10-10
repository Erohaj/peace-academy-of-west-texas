# Taking donations

**Live since 2026-10-10.** The site takes real donations: a $1 gift was made
with a real card, the row went `paid`, the receipt arrived carrying the EIN,
and refunding it from the Dashboard flipped the row to `refunded` — the whole
path, both directions, on real money.

What follows is the list as it was worked through, kept because it is also the
runbook for doing this again: a second Stripe account, a rebuilt project, or
someone asking why a step exists. The order mattered, and the flag at step 6
was the last thing flipped, because it is the only step a visitor can see.

Every box below was reconciled against the running system on 2026-10-10 rather
than from memory: the hosted secrets from `supabase secrets list`, the flag from
`deploy.yml` and the published bundle, the webhook from a live payment Stripe
itself delivered. One box is still open and two are unverified, and all three
say so where they stand. A runbook with stale boxes is worse than one with no
boxes at all: it reads as "not done" for work that is finished, and that noise
is what hides the work that genuinely is not.

---

## 0. Where things stand today

| | State |
|---|---|
| Widget, Edge Functions, `donations` table, RLS | written, `npm run lint` clean |
| `VITE_DONATIONS_ENABLED` | **on**, in `deploy.yml` and `.env.example` |
| Stripe account | **activated.** Charges and payouts enabled, no outstanding requirements, business type `non_profit`, paying out to a verified Bank of America account |
| Hosted Edge Function secrets | all seven set, and `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` are the **live** pair |
| EIN | **82-4145937.** It existed all along — an organisation cannot hold 501(c)(3) status without one, so it was issued with the exemption, not waiting to be applied for. Confirmed against IRS Business Master File data: name and the Brentwood Dr address match exactly, ruling date 1 July 2019, status active, 990-EZ filed for 2023 and 2024 |
| Stripe webhook endpoints | live `we_1UOs45ApOhsap1HPpqiM9DFm`, test `we_1UOnfRApOhsap1HPMzKsD8ID`. Both carry all four events |
| Supabase project | `zusgxrezbffxxhztggev`, linked |
| Local tooling | Docker, local Supabase stack and Stripe CLI 1.52 all verified working |

While the flag was off, the donate tab showed a "by check / by email" panel
with the org's postal address. That was a real way to give, not a placeholder,
which is why there was no rush to flip the flag before the rest of this list
was true. That branch is still in the source — `!donationsEnabled` in
`DonationWidget.tsx` — so turning the flag back off restores the panel rather
than breaking the donate tab.

## 1. The Stripe account itself

Test mode needs none of this — a Stripe account in test mode works immediately
and issues `sk_test_…` keys. **Live** mode is what needs:

- [x] Business details and the **EIN** — `82-4145937`
- [x] A **bank account** for payouts — a verified Bank of America account,
      confirmed on Stripe's Payouts settings page
- [x] Stripe's own identity verification cleared — charges and payouts both
      enabled, no outstanding requirements

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

- [x] `STRIPE_SECRET_KEY` — set. Without it `create-checkout-session` returns
      "Payments are not configured" (500)
- [x] `STRIPE_WEBHOOK_SECRET` — set. Without it the webhook returns 500 and **no
      donation is ever marked paid**
- [x] `SITE_URL` — set. **The first entry is the fallback return address.** It is a
      comma-separated list so localhost can be tested without shipping it; put
      production first or a donor who pays is returned to a dead address
      (`pickReturnUrl()` in `create-checkout-session/index.ts`)
- [x] `ORG_EIN` — set to `82-4145937`. Receipts now carry the tax-ID line and
      tell the donor to keep the letter; before it was set they deliberately
      omitted the line rather than print a placeholder, and the webhook logged
      it every time
- [x] `RESEND_API_KEY` — set. Without it no receipt is sent. The webhook now leaves
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

- [x] URL: `https://zusgxrezbffxxhztggev.supabase.co/functions/v1/stripe-webhook`
- [x] Events — all four, each one is handled:
      `checkout.session.completed`, `invoice.paid`,
      `checkout.session.expired`, `charge.refunded`
- [x] Copy the endpoint's **signing secret** into `STRIPE_WEBHOOK_SECRET`
      (step 2) and redeploy

These three are ticked on the strength of a live payment rather than a reading
of the dashboard: the $1 donation went `paid` from a `checkout.session.completed`
Stripe delivered to this URL, and the refund came back as `charge.refunded`. An
endpoint with a wrong URL, a missing event or a mismatched secret cannot do
that.

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

**Unverified — along with the payout in step 8, the only unfinished business in
this document.** These govern the **admin magic-link login**, not donations: the
donate widget calls the Edge Functions with the anon key and never touches
Supabase Auth, and the address a donor returns to after paying comes from
`SITE_URL`. Going live never depended on this step, which is why it was never
closed.

It also cannot be checked from the command line: the Management API wants an
access token the CLI keeps in the Windows credential store, and the public
`/auth/v1/settings` endpoint does not return redirect URLs. Open the dashboard
page named above, or attempt an admin sign-in and see whether the emailed link
lands on the site.

A mismatch fails silently at click time — Supabase substitutes the project's
Site URL rather than returning an error.

## 6. Flip the flag — last

- [x] `.env.local`: `VITE_DONATIONS_ENABLED="true"`
- [x] `.github/workflows/deploy.yml`, in the build step's `env:` block next to
      `VITE_EMAIL_ENABLED`:

      ```yaml
      VITE_DONATIONS_ENABLED: 'true'
      ```

      **Production stays off without this line**, whatever `.env.local` says —
      Vite inlines the flag at build time and CI has its own environment. It
      lives in plain sight rather than in repo secrets so that what production
      was built with is readable from the repository.
- [x] `.env.example`: uncomment the flag so the next person sees it

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

- [x] A real renewal cycle, driven by a Stripe test clock. A customer on a
      frozen clock was given a card and a $15/month subscription, the clock
      advanced 32 days, and Stripe billed the next cycle on its own: the
      `invoice.paid` it delivered carried `billing_reason:
      subscription_cycle`, the webhook inserted a **second** `paid` row
      against the same `stripe_subscription`, and the receipt went out.
      The negative half matters as much — the `subscription_create` invoice
      at sign-up produced **no** row, which is what keeps every monthly gift
      from being double-counted on day one.

Nothing in the donation flow is left unverified: everything above was exercised
against the hosted project. The account setup it used to wait on — the bank
account, the identity check, the live key — was finished on 2026-10-10, and a
real dollar has since gone through and come back out as a refund. See step 8.

## 8. Go live

- [x] Swap in the live key. **Not** `sk_live_…` in the end: the only Stripe
      call the whole site makes is `checkout.sessions.create`, so it runs on a
      **restricted** key (`rk_live_…`) granted Write on Checkout Sessions,
      Products, Prices, Customers and Subscriptions and nothing else. No
      refunds, no payouts, no balance, no reading the customer list. The full
      secret key could not have been reused anyway — Stripe reveals it once at
      creation, and this account's dates from 2023
- [x] Create the webhook endpoint **again in live mode** and copy its
      *different* signing secret into `STRIPE_WEBHOOK_SECRET`
- [x] Redeploy the functions — not needed, as it turns out: secrets are read
      at runtime. The code was already current from the test-mode round
- [x] Make one real donation with a real card, then refund it. $1.00 →
      `paid`, receipt delivered with the tax-ID line, then refunded from the
      Dashboard → `refunded`. Before paying, expiring two unpaid live sessions
      proved the live endpoint and its signature for free
- [ ] Confirm the payout lands in the bank account — payouts are daily and
      automatic, so this shows up on its own once there is a real balance.
      **It cannot close yet:** the only live charge so far was the $1 test and
      it was refunded, so the balance is zero and there is nothing to pay out.
      The first real donation closes this box without anyone doing anything

---

## The confirmation number

Every receipt carries `Confirmation #: 4F2A9C01` — the first eight hex digits
of the `donations.id` UUID, uppercased. It exists so a donor on the phone has
something to quote that is shorter than a 36-character UUID and shorter still
than `pi_3QxAbCDeFgHiJkLm0nOpQrSt`.

The same code is written into Stripe as `confirmation_number` on the
**PaymentIntent**, not only on the Checkout Session: session metadata is never
copied onto the payment, and the Dashboard's payment search reads the
payment's. So the one code a donor quotes can be pasted into Stripe's search
box and into the `donations` table alike. Paste it into the Dashboard search,
or:

```bash
stripe payment_intents search --query 'metadata["confirmation_number"]:"4F2A9C01"'
```

For this to be possible the row id is generated in
`create-checkout-session` — `crypto.randomUUID()` — rather than left to the
table's `gen_random_uuid()` default, because the Checkout Session is created
before the row is inserted and the number has to exist in order to travel with
it.

Monthly **renewals** are the one gap: those rows are inserted by the webhook
from `invoice.paid`, so each renewal receipt carries its own number but that
number is not in Stripe. The subscription still holds the first donation's
metadata, which is the thread back to the series, and the invoice itself is
searchable by customer.

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
