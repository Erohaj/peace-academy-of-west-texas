# Tests for prepaid event tickets

Three scripts, run by hand against the local stack. They exist because this is
the only part of the site that moves money attached to a specific seat on a
specific date, and `npm run lint` cannot tell you whether a seat comes back
when a payment fails.

They are not wired into CI and there is no test framework here — see the note
in `CLAUDE.md`. Run them after changing anything in
`supabase/migrations/*_event_tickets.sql`, `create-ticket-session`,
`ticket-status` or the ticket branches of `stripe-webhook`.

## First: the local stack needs grants the hosted project already has

```bash
npm run db:start
npm run db:reset
```

Then, **before** the function and webhook scripts will work:

```bash
docker exec -i supabase_db_peace-academy-of-west-texas psql -U postgres -d postgres \
  -c "grant select, insert, update, delete on all tables in schema public to service_role;" \
  -c "grant select on public.events, public.gallery_items, public.shifts,
       public.legal_documents, public.legal_document_versions to anon, authenticated;"
```

This is **not** something the migrations are missing. On the hosted project
every table created in `public` is granted to `anon`, `authenticated` and
`service_role` by a default privilege belonging to `supabase_admin` — which is
the only reason the `revoke` statements throughout the migrations make sense,
and why `revoke update on public.events from authenticated` is the way an
admin is kept out of `reserved_spots`. Locally the migrations run as
`postgres`, whose default privilege grants those roles only
`TRUNCATE/REFERENCES/TRIGGER`, so nothing reaches PostgREST or an Edge
Function at all. `donation-status` — untouched code that demonstrably works in
production — fails identically without the grants above, which is how this was
diagnosed rather than guessed.

## 1. The database lifecycle

```bash
docker exec -i supabase_db_peace-academy-of-west-texas \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < supabase/tests/event_tickets.sql
```

Fifteen scenarios, every check an `ASSERT`, ending in `ALL TICKET TESTS
PASSED` or stopping on the first thing that is not true. It covers the grants
(`anon` must not be able to confirm its own payment), the constraints, the
pending hold and its per-attendee price, capacity against held seats,
idempotent confirmation, expiry, the retry a failed payment must allow, the
refund, the payment that lands *after* its hold was released, cash and its
undo, and that free and door-fee bookings behave exactly as they did before
any of this existed.

It cleans up after itself and can be re-run without a reset.

## 2. create-ticket-session

```bash
# A deliberately invalid key: every call then books the seat and fails at
# Stripe, which is the path worth testing hardest.
printf 'STRIPE_SECRET_KEY=sk_test_deliberatelyInvalidKeyForLocalTesting\nSTRIPE_WEBHOOK_SECRET=whsec_deliberatelyInvalidForLocalTesting\nSITE_URL=http://localhost:3000\n' > /tmp/fn.env
npx supabase functions serve --no-verify-jwt --env-file /tmp/fn.env &

bash supabase/tests/event_tickets_functions.sh
```

Asserts that the seat comes back every time Stripe cannot be reached, that the
booking is left `failed` rather than `pending`, that an unknown event, an event
that is not prepaid, a full event and every malformed input are each refused
with the right code and without booking anything, and that somebody returning
to pay for an attempt they abandoned is not turned away as a duplicate.

## 3. stripe-webhook

```bash
node supabase/tests/event_tickets_webhook.mjs
```

Needs the same `functions serve` running. Stripe's signature is an
HMAC-SHA256 over `<timestamp>.<raw body>` keyed with the endpoint secret, and
the secret above is one this script knows — so the synthetic events it sends
are signed the way Stripe signs its own and `constructEventAsync` accepts or
rejects them on the real rule. It checks that a wrongly signed, unsigned or
two-hour-old event is refused and changes nothing, that a paid session
confirms the seat idempotently, that a session completing *without* the money
leaves the booking pending, that an expiry and a refund each release the seat
exactly once, and that a donation session still goes down the donation path
with no booking invented for it.

## What these cannot cover

A real Stripe Checkout page, a real card, and a real receipt from Resend. The
webhook tests prove the signature check and every branch behind it, but
nothing here has handed Stripe money. That is step 4 of
`docs/paid-events.md`, and it needs a real test-mode key.

Note also that `notify_rsvp_confirmation` posts to the **hosted** project's
`send-rsvp-confirmation` — the URL is hardcoded in the migration — so a local
test that confirms a payment fires a request at production. It is harmless:
that function looks the event up by id, local ids do not exist there, and it
returns 404 before composing anything. No mail is sent. Worth knowing before
you wonder why `net.http_request_queue` is filling up.
