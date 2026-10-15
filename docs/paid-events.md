# Prepaid event tickets

**Built and tested against a local stack; no real money has moved.** The
migration has been applied from scratch twice with `npm run db:reset`, the
whole booking lifecycle is covered by `supabase/tests/event_tickets.sql` (15
scenarios, all passing), `create-ticket-session` has been driven through every
refusal and through the rollback that gives a seat back when Stripe cannot be
reached, and `stripe-webhook` has been driven with **properly signed**
synthetic events — Stripe's signature is an HMAC over the body with the
endpoint secret, so a local secret makes the real check verifiable rather than
stubbed. The browser flow was exercised end to end in both languages.

What has **not** happened: a real Stripe Checkout page, a real card, a real
receipt out of Resend, and a real payout. Those are steps 2 through 5 below.
Every box here is still open, because each describes something to do against
the live project — none of them is closed by a local run. The opposite
mistake, a runbook with boxes ticked from memory, is what
`docs/donations-go-live.md` had to be dug out of.

What the local work does mean is that the logic underneath is not guesswork.
`supabase/tests/README.md` says how to re-run it, and names the one thing that
has to be granted by hand before the local stack can reach an Edge Function at
all.

The feature ships **off**: `VITE_TICKETS_ENABLED` is `'false'` in
`.github/workflows/deploy.yml`, and with it off nothing about the site changes.
An event's `fee` goes on being a published figure, RSVPs stay free, and the
admin panel does not offer the prepaid toggle. No event can be marked prepaid
until somebody turns the flag on, which is why this can sit in `main` safely
while the list below is worked through.

---

## 0. What was built

| | |
|---|---|
| Migration | `supabase/migrations/20261013120000_event_tickets.sql` |
| New Edge Functions | `create-ticket-session`, `ticket-status` |
| Changed Edge Functions | `stripe-webhook` (ticket branches), `send-rsvp-confirmation` (payment block) |
| Feature flag | `VITE_TICKETS_ENABLED`, `src/lib/features.ts` |
| Per-event switch | `events.payment_required`, in the admin panel next to the fee |
| Tests | `supabase/tests/` — database lifecycle, Edge Function, signed webhook |

### The model, in one paragraph

An event with `payment_required` is booked and paid for in a single call to
`create-ticket-session`. That function runs `create_rsvp` with the service
role, which writes the booking as `pending`, prices it from `events.fee` times
the party size, and **counts its seats immediately** with a `hold_expires_at`
35 minutes out. It then opens a Stripe Checkout session whose `expires_at` is
two minutes *inside* that deadline, so Stripe stops accepting the payment
before the seat can be given to anybody else. `stripe-webhook` is the only
writer that marks the booking `paid`. If the money never comes, the seats go
back — on `checkout.session.expired`, or lazily the next time anyone books that
event, because `create_rsvp` sweeps the event's expired holds under its own row
lock before deciding whether the event is full.

### Two deliberate choices worth not reversing

**`payment_required` is a separate field from `fee`, not `fee > 0`.** Every
event in the table already carries a fee and takes free RSVPs; the money is
collected at the door. Deriving "must prepay" from the price would have turned
all of them into paid tickets the moment the migration ran, and left the people
already holding a free booking for a $60 workshop in a state nothing could
explain.

**Ticket money is recorded on the `rsvps` row, not in `donations`.** A ticket
buys admission, which is precisely the "goods or services" that makes a payment
non-deductible under IRS Pub. 1771. In the donations table it would feed
receipts that state no goods or services were provided — a false statement
about somebody's taxes — and inflate whatever the organisation reports as
contributions. The ticket confirmation email says so in both languages.

---

## 1. Prerequisites

- [ ] **Donations already work.** Tickets share the Stripe account, the
      webhook endpoint and its signing secret, so none of this can be true
      before `docs/donations-go-live.md` is. It is, as of 2026-10-10.
- [ ] **No new Stripe dashboard configuration.** Worth stating because it
      looks like it should need some: the three events tickets rely on —
      `checkout.session.completed`, `checkout.session.expired`,
      `charge.refunded` — are already on both endpoints, live and test, from
      the donation work. `invoice.paid` is the only one tickets never use.
- [ ] **No new Edge Function secrets.** `STRIPE_SECRET_KEY`,
      `STRIPE_WEBHOOK_SECRET`, `SITE_URL`, `RESEND_API_KEY` and
      `CONTACT_INBOX` are the whole set, all already hosted. `ORG_EIN` is
      deliberately *not* used by the ticket path — see the tax note above.
- [ ] One **restricted key check**: the live key is an `rk_live_…` granted
      Write on Checkout Sessions, Products, Prices, Customers and
      Subscriptions. `create-ticket-session` calls
      `checkout.sessions.create` and `checkout.sessions.expire`. **Confirm
      the key can expire a session** — it is a write on Checkout Sessions, so
      it should be covered, but if it is not, the retry path (§4) fails in a
      way that only shows up as a warning in the function log.

## 2. Apply the migration

```bash
npm run db:push     # or paste supabase/setup/00_full_setup.sql on a fresh project
```

- [ ] It applies cleanly against the **live** schema. It applies cleanly to a
      fresh local one — twice, which also proves the `drop trigger if exists`
      guards let it be re-run — but the live database is not fresh: this adds
      two constraints to `events`, three to `rsvps`, replaces the
      one-row-per-email index with a partial one, rewrites `create_rsvp`, adds
      five functions and re-points two triggers, all over existing rows.
      Nothing here backfills, so the risk is a constraint meeting data that
      predates it: every existing booking lands on `payment_status =
      'not_required'` with no amount and no deadline, which satisfies all
      three. Check it anyway.
- [ ] `supabase/setup/98_verify.sql` reports ✅ on all 24 rows. It does
      locally. Rows 21–24 are new and are the ones to read: the columns exist,
      the five payment functions exist, **`anon` cannot execute any of them**,
      and both confirmation triggers are in place.
- [ ] Row 23 in particular. In PostgreSQL a new function is executable by
      PUBLIC by default, so the migration revokes `from public, anon,
      authenticated` rather than from the two roles alone. If that revoke were
      missed, any visitor could call `mark_rsvp_paid` on their own booking and
      walk in without paying. The test suite asserts the same thing from the
      other side, and the revoke is the one line in the migration that would
      be silently catastrophic to lose.
- [ ] `src/lib/database.types.ts` already carries the new columns, written by
      hand to match. If you run `npm run db:types`, diff it rather than
      trusting it — the file is hand-maintained and the generator will also
      reformat everything around it.

## 3. Deploy the functions

```bash
npm run functions:deploy
```

- [ ] All seven deploy. Two are new (`create-ticket-session`,
      `ticket-status`) and two changed (`stripe-webhook`,
      `send-rsvp-confirmation`).
- [ ] **Check `supabase functions list` for the dates afterwards.** Secrets
      are read at runtime, so a stale function build behaves like a current
      one right up until it meets something new — which is how the three
      donation functions spent three months on a 27 July build while looking
      healthy. A `stripe-webhook` that predates this work will silently ignore
      every `kind: 'event_ticket'` session: the money arrives, the booking
      stays `pending`, and the seat is released 35 minutes later.

## 4. Prove it in test mode

Switch `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` to the test pair, or forward
with the CLI as `docs/donations-go-live.md` §4 describes. Mark one event
prepaid with a small fee and work down this list.

**Most of what follows has an automated counterpart that already passes** —
`supabase/tests/` covers the lifecycle, the Edge Function's refusals and
rollback, and every webhook branch behind a real signature check. Run those
first; they take seconds and they fail loudly. This list is what they cannot
reach: Stripe's own hosted page, a card, and an email actually arriving.

- [ ] A prepaid event's RSVP form shows the breakdown (`3 × $20`), the total,
      and the half-hour note, and its button says what it will do. *(Verified
      locally in both languages: the arithmetic follows the guest dropdown
      live, and the button reads "Continue to payment · $70".)*
- [ ] Paying confirms the booking: `payment_status = 'paid'`, `paid_at` set,
      `payment_method = 'card'`, `hold_expires_at` cleared. *(Verified locally
      from a signed `checkout.session.completed`, including that a duplicate
      delivery changes nothing.)*
- [ ] The confirmation email arrives **with** the payment block, says the
      amount and the confirmation number, and states that admission is not a
      tax-deductible donation. In Spanish too — unlike the donation receipt,
      this template has both languages.
- [x] A **pending** booking gets **no** email, and paying it sends exactly
      one. Covered by `event_tickets.sql` §14, which counts rows in
      `net.http_request_queue` rather than trusting the trigger definition.
      This is the regression to watch for: the insert trigger carries a `WHEN`
      clause, and losing it would mean telling somebody they are registered
      while they are still typing their card number.
- [ ] The return screen polls and shows the confirmed seat, not the query
      string. Open `?ticket=success&session_id=cs_invalid` directly: it must
      say the payment could not be found, not congratulate anyone. *(Verified
      locally: it opens on "your payment is still going through", then shows
      the amount, party size, confirmation number and the not-deductible line
      once the row reads paid.)*
- [ ] **Abandon the payment.** Close Stripe's tab, wait for
      `checkout.session.expired` (Stripe sends it at the `expires_at`, roughly
      33 minutes), and confirm the booking goes `failed` and
      `events.reserved_spots` comes back down by the full party size. *(The
      handler is verified locally from a signed event; what this adds is that
      Stripe really does send it, at the deadline this code set.)*
- [x] **The lazy sweep.** Covered by `event_tickets.sql` §6 and §7: a hold
      pushed into the past is released before the next capacity check, the
      sweep run twice does not release the same seats twice, and the attendee
      whose payment failed can book again rather than being told they are
      already registered.
- [ ] **Retry.** Start a payment, abandon it, and immediately book again with
      the same email. *(The booking half is verified locally — the old hold is
      released and the new attempt accepted. What needs a real key is the other
      half: that `checkout.sessions.expire` actually closed the old session so
      it cannot still be paid. That call is also the one the restricted live
      key must be allowed to make — see §1.)*
- [ ] **The last-second payment.** Hard to stage and worth reading the code
      for instead: `mark_rsvp_paid` re-takes the seats of a booking whose hold
      was already released, going over `total_spots` if it must and raising a
      warning. Overbooking by one is the chosen failure; charging somebody for
      a seat they cannot have is not.
- [ ] **Refund.** Refund the charge in Stripe. *(The webhook half is verified
      locally from a signed `charge.refunded`, including that a second delivery
      does not release the seat twice, and that a refunded **donation** still
      finds no booking to touch. What is untested is Stripe actually sending
      it for a ticket.)*
- [x] **Cash.** Covered by `event_tickets.sql` §11 and §13, under a real
      admin JWT: marking cash takes the seat back and stamps `marked_paid_by`,
      un-marking releases it, pressing un-mark twice does not release it twice,
      and a door-fee booking marked and un-marked keeps the seat it never owed
      for. What is left to check by hand is that the select reads clearly in
      the panel.
- [x] **A card booking refuses the admin select** (PA009), and an invented
      method is refused too (PA010). Covered by `event_tickets.sql` §11.
- [x] Free events, and events with a fee collected at the door, are
      completely unchanged: one-step form, instant confirmation,
      `payment_status = 'not_required'`, no amount, no deadline, and the sweep
      never touches them. Covered by `event_tickets.sql` §12.
- [ ] The RSVP CSV export carries the four new columns.
- [ ] With `VITE_TICKETS_ENABLED` off, a prepaid event's RSVP button opens a
      panel with the organisation's address and **no form** — not a free
      booking for a seat that has a price. *(Verified locally.)*

## 5. Go live

- [ ] Live keys back in place.
- [ ] `VITE_TICKETS_ENABLED="true"` in `.env.local`.
- [ ] `VITE_TICKETS_ENABLED: 'true'` in `.github/workflows/deploy.yml`.
      **Production stays off without this line**, whatever `.env.local` says.
- [ ] Uncomment the flag in `.env.example`.
- [ ] One real payment for a real seat, with a real card, then refunded —
      confirming the seat comes back.

---

## Known limits, by choice

**No cron sweeper.** Expired holds are released when the event is next booked,
not on a timer. The correctness that matters is covered — nobody is ever
*refused* a seat that is really free, because the sweep runs under the event's
own lock before every capacity check. What is left is cosmetic: a public
listing can show an event fuller than it is for up to 35 minutes. Adding
`pg_cron` to call `release_expired_rsvp_holds(null)` every few minutes would
close that; it is deliberately not a dependency of the feature working.

**The hold is 35 minutes, not 30.** Stripe refuses a session `expires_at` less
than 30 minutes out, and the booking row is written first, so a flat 30 here
would have the Edge Function asking Stripe for 29-something and being turned
down. The visitor is told "about half an hour", which both numbers honour.

**Guests are charged.** `events.fee` is per attendee — its own column comment
has said so since it was added — so the total is the fee times the party size,
and Stripe's page shows it as `quantity × unit price`. An event priced per
family or per table has no way to say so yet.

**Ticket revenue does not appear on the Donations tab.** By design, per the tax
note above. It is on the RSVPs tab with a payment badge, and in that CSV with
`payment_status`, `amount_usd`, `payment_method` and `paid_at`.

**Marking cash on a booking that is still `pending` leaves its Stripe session
live.** Nothing in SQL can expire a Checkout session, so if somebody says they
will pay cash while their own payment page is still open, the admin select will
confirm the seat and the card can still be charged afterwards — money with no
matching booking, which then needs refunding by hand. Either wait for the hold
to lapse (the roster shows "Holding" until it does) or expire the session in
the Stripe dashboard first. The badge is amber for exactly this half hour.

**A `failed` booking stays in the table.** It is the organisation's record of
somebody who tried to come, and the partial unique index lets that address book
again. The roster shows it as "Unpaid" in red and the badge's tooltip says it
is not an attendee.
