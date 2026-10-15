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

**A full test-mode run against real Stripe has since been completed** (2026-10-15,
sandbox `acct_1MyLpqApOhsap1HP`): a $40 booking for two seats, paid with card
`4242 4242 4242 4242` on Stripe's own hosted page, with `stripe listen`
forwarding the webhooks to a local stack. Stripe's page showed `Qty 2, $20.00
each`; the payment confirmed the booking and held the seats; the confirmation
number on the attendee's screen was findable in Stripe by
`metadata["confirmation_number"]`; refunding released the seats; and expiring
an abandoned session released them too. The per-item notes in §4 say which
box that closed.

**And then on the live project, with the live key and a real card** (also
2026-10-15): a $1 seat on a throwaway event, paid from the Checkout page. That
closed the one box a sandbox could never reach. The confirmation email arrived
carrying `Paid: $1.00`, `Method: Card` and confirmation number `42E5F78B` —
the same number the screen had shown — with the line stating that admission is
not a tax-deductible donation. Refunding it released the seat without anyone
touching the database (1/25 → 0/25), and a hold abandoned on another event
released its own seat when it lapsed (2/32 → 1/32), which is the one piece of
timing the sandbox run had had to simulate.

What has **not** happened: a payout into the bank account, which cannot happen
until there is a real balance to pay out. The opposite mistake, a runbook with
boxes ticked from memory, is what `docs/donations-go-live.md` had to be dug out
of.

What the local work does mean is that the logic underneath is not guesswork.
`supabase/tests/README.md` says how to re-run it, and names the one thing that
has to be granted by hand before the local stack can reach an Edge Function at
all.

The feature is **on** since 2026-10-15: `VITE_TICKETS_ENABLED` is `'true'` in
`.github/workflows/deploy.yml`. With it off nothing about the site changes.
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

- [x] **Donations already work.** Tickets share the Stripe account, the
      webhook endpoint and its signing secret, so none of this can be true
      before `docs/donations-go-live.md` is. It is, as of 2026-10-10.
- [x] **No new Stripe dashboard configuration.** Worth stating because it
      looks like it should need some: the three events tickets rely on —
      `checkout.session.completed`, `checkout.session.expired`,
      `charge.refunded` — are already on both endpoints, live and test, from
      the donation work. `invoice.paid` is the only one tickets never use.
- [x] **No new Edge Function secrets.** `STRIPE_SECRET_KEY`,
      `STRIPE_WEBHOOK_SECRET`, `SITE_URL`, `RESEND_API_KEY` and
      `CONTACT_INBOX` are the whole set, all already hosted. `ORG_EIN` is
      deliberately *not* used by the ticket path — see the tax note above.
- [x] `checkout.sessions.create` works on the live restricted key — a real
      $1 payment went through it on 2026-10-15.
- [ ] `checkout.sessions.expire` on the **live** key is still unproven. It is a
      write on Checkout Sessions so it should be covered by the same grant, and
      it worked against the sandbox key. If it is not, the retry path (§4)
      fails as a warning in the function log and nowhere else, which is why
      this box stays open rather than being assumed.

## 2. Apply the migration

```bash
npm run db:push     # or paste supabase/setup/00_full_setup.sql on a fresh project
```

- [x] It applies cleanly against the **live** schema. It applies cleanly to a
      fresh local one — twice, which also proves the `drop trigger if exists`
      guards let it be re-run — but the live database is not fresh: this adds
      two constraints to `events`, three to `rsvps`, replaces the
      one-row-per-email index with a partial one, rewrites `create_rsvp`, adds
      four functions and re-points two triggers, all over existing rows.
      Nothing here backfills, so the risk is a constraint meeting data that
      predates it: every existing booking lands on `payment_status =
      'not_required'` with no amount and no deadline, which satisfies all
      three. Check it anyway.
- [x] `supabase/setup/98_verify.sql` reports ✅ on all 24 rows locally. On the
      live project only the four ticket rows were run (21–24, all ✅); the other
      twenty check things this work does not touch and were green before it. Rows 21–24 are new and are the ones to read: the columns exist,
      the five payment functions exist, **`anon` cannot execute any of them**,
      and both confirmation triggers are in place.
- [x] Row 23 in particular — green on the live project. In PostgreSQL a new function is executable by
      PUBLIC by default, so the migration revokes `from public, anon,
      authenticated` rather than from the two roles alone. If that revoke were
      missed, any visitor could call `mark_rsvp_paid` on their own booking and
      walk in without paying. The test suite asserts the same thing from the
      other side, and the revoke is the one line in the migration that would
      be silently catastrophic to lose.
- [x] `src/lib/database.types.ts` already carries the new columns, written by
      hand to match. If you run `npm run db:types`, diff it rather than
      trusting it — the file is hand-maintained and the generator will also
      reformat everything around it.

## 3. Deploy the functions

```bash
npm run functions:deploy
```

- [x] All seven deploy. Two are new (`create-ticket-session`,
      `ticket-status`) and two changed (`stripe-webhook`,
      `send-rsvp-confirmation`).
- [x] **Check `supabase functions list` for the dates afterwards.** Secrets
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

- [x] A prepaid event's RSVP form shows the breakdown, the total, and the
      half-hour note, and its button says what it will do. Verified in both
      languages, and carried through to Stripe's own page, which showed the
      event title, the venue and date line, `Qty 2, $20.00 each` and a
      prefilled email.
- [x] Paying confirms the booking: `payment_status = 'paid'`, `paid_at` set,
      `payment_method = 'card'`, `hold_expires_at` cleared, payment intent
      recorded, seats unchanged at 2/10. Done with a real card on Stripe's
      hosted page; the `checkout.session.completed` Stripe delivered got a 200.
      A duplicate delivery changing nothing is covered by the webhook tests.
- [x] The confirmation email arrives **with** the payment block, says the
      amount and the confirmation number, and states that admission is not a
      tax-deductible donation. Closed on the live project, which is the only
      place it could be: the trigger posts to the *hosted*
      `send-rsvp-confirmation`, so a local booking's id is one that function
      cannot find, and it returns 404 before composing anything.

      Worth knowing for the people this is sent to: Gmail filed it under
      **Updates**, not Primary. It was not missing, it was on another tab. The
      Spanish side is still unexercised — same code path, different string
      table, so that is a reading rather than a risk. **A local run cannot close this**: the
      trigger posts to the *hosted* `send-rsvp-confirmation` (the URL is
      hardcoded in the migration), which looks the event up by id, does not
      find a local one, and returns 404 before composing anything. Closing it
      needs a prepaid booking paid for on the live project.
- [x] A **pending** booking gets **no** email, and paying it sends exactly
      one. Covered by `event_tickets.sql` §14, which counts rows in
      `net.http_request_queue` rather than trusting the trigger definition.
      This is the regression to watch for: the insert trigger carries a `WHEN`
      clause, and losing it would mean telling somebody they are registered
      while they are still typing their card number.
- [x] The return screen polls and shows the confirmed seat, not the query
      string. After the real payment Stripe returned the browser to
      `?ticket=success&session_id=…`, the app routed to the events tab,
      cleared the parameters, and the panel read "You're registered — payment
      received" with `Paid: $40.00`, `Party size: 2`, `Confirmation #:
      F32AE950` and the not-deductible line. An invented session id still says
      the payment could not be found.
- [x] **Abandon the payment.** A three-seat booking was taken to Checkout and
      then expired through the API rather than waiting out the deadline:
      Stripe delivered `checkout.session.expired`, the booking went `failed`,
      and all three seats came back (3/10 → 0/10). What remains unobserved is
      only the clock itself — that Stripe fires it unprompted at `expires_at`.
- [x] **The lazy sweep.** Covered by `event_tickets.sql` §6 and §7: a hold
      pushed into the past is released before the next capacity check, the
      sweep run twice does not release the same seats twice, and the attendee
      whose payment failed can book again rather than being told they are
      already registered.
- [ ] **Retry.** Start a payment, abandon it, and immediately book again with
      the same email. The booking half is covered by the function tests, and
      `checkout.sessions.expire` is now known to work against a real session
      (it is what the abandon case above used). The half still unobserved is
      somebody *trying to pay* an expired session and being refused. The same
      call is the one the restricted live key must be allowed to make — §1.
- [ ] **The last-second payment.** Hard to stage and worth reading the code
      for instead: `mark_rsvp_paid` re-takes the seats of a booking whose hold
      was already released, going over `total_spots` if it must and raising a
      warning. Overbooking by one is the chosen failure; charging somebody for
      a seat they cannot have is not.
- [x] **Refund.** The $40 sandbox charge was refunded through the Stripe API;
      `charge.refunded` arrived, the booking became `refunded` and both seats
      were released (2/10 → 0/10). That a second delivery does not release the
      same seats twice, and that a refunded **donation** finds no booking to
      touch, are covered by the webhook tests.
- [x] **Cash. Removed, not tested.** Recording a fee taken in person was built
      and then taken out before it was ever used — see the 2026-10-15 migration.
      An event either charges through this site or this site stays out of the
      money entirely, and the roster reports Stripe's answer rather than
      offering a control that could contradict it.
- [x] **No booking can be edited from the panel at all** — there is no control
      to press. A correction is a refund in Stripe, and the webhook brings it
      back.
- [x] Free events, and events with a fee collected at the door, are
      completely unchanged: one-step form, instant confirmation,
      `payment_status = 'not_required'`, no amount, no deadline, and the sweep
      never touches them. Covered by `event_tickets.sql` §12.
- [ ] The RSVP CSV export carries the four new columns.
- [x] The confirmation number an attendee is shown is findable in Stripe:
      `stripe payment_intents search --query 'metadata["confirmation_number"]:"F32AE950"'`
      returned the $40 payment. That is the whole reason the number is written
      onto the PaymentIntent and not only the session.
- [ ] With `VITE_TICKETS_ENABLED` off, a prepaid event's RSVP button opens a
      panel with the organisation's address and **no form** — not a free
      booking for a seat that has a price. *(Verified locally.)*

## 5. Go live

- [x] Live keys back in place.
- [x] `VITE_TICKETS_ENABLED="true"` in `.env.local` (only affects your own
      `npm run dev`; production reads the workflow).
- [x] `VITE_TICKETS_ENABLED: 'true'` in `.github/workflows/deploy.yml`, since
      2026-10-15. **Production stays off without this line**, whatever
      `.env.local` says. On its own it changes nothing a visitor sees: an event
      still has to be marked prepaid before anybody is asked to pay.
- [x] Uncomment the flag in `.env.example`.
- [x] One real payment for a real seat, with a real card, then refunded —
      confirming the seat comes back. $1 on 2026-10-15: paid, confirmed,
      emailed, refunded, and the seat released by the webhook rather than by
      hand.

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

**A `failed` booking stays in the table.** It is the organisation's record of
somebody who tried to come, and the partial unique index lets that address book
again. The roster shows it as "Unpaid" in red and the badge's tooltip says it
is not an attendee.
