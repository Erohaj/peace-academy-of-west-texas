-- Prepaid tickets: an event may now require payment before the seat is real.
--
-- `events.fee` has existed since 20260918120000 as a *published figure* — a
-- number to print on the card, collected at the door if at all. Its own
-- comment said so: "This site never charges it." This migration is the change
-- that makes it collectable, and it is deliberately not the same switch.
--
-- `payment_required` is a second, explicit flag rather than `fee > 0` for one
-- reason: every event currently in the table has a fee written in and takes
-- free RSVPs today. Deriving "must prepay" from the price would silently turn
-- all of them into paid tickets the moment this migration ran, and the people
-- who already hold a free booking for a $60 workshop would be in a state
-- nothing in the system could explain. A fee that is collected at the door
-- stays a legitimate, unchanged arrangement; `payment_required` is how an
-- organiser says "not this one — this one is prepaid".
--
-- The seat accounting is the whole point and the only hard part. A prepaid
-- booking is inserted *before* the money arrives, holding its seats for about
-- half an hour while the visitor is on Stripe's page, and the hold has to be
-- given back if they never pay. So `rsvps` grows a payment lifecycle, and
-- `events.reserved_spots` — which only `create_rsvp` was ever allowed to
-- touch — is now also decremented by the three functions below. Nothing else
-- may write it; that restriction is what has kept the count honest.
--
--   not_required -> (free event, or one whose fee is taken at the door)
--   pending      -> seats held, Stripe session open, hold_expires_at set
--   paid         -> money in, seats confirmed, confirmation email sent
--   failed       -> hold expired or abandoned, seats released
--   refunded     -> money returned, seats released
--
-- Money is NOT recorded in `donations`. A ticket is a purchase: the attendee
-- receives admission in exchange, which is exactly the "goods or services"
-- that makes a payment non-deductible under IRS Pub. 1771. Putting ticket
-- revenue in the same table as gifts would feed it into receipts that state
-- no goods or services were provided, and into whatever the organisation
-- reports as contributions. It lives on the `rsvps` row instead.

-- ---------------------------------------------------------------------------
-- events.payment_required
-- ---------------------------------------------------------------------------

alter table public.events
  add column if not exists payment_required boolean not null default false;

-- A prepaid event with no price is unbookable by construction: the Checkout
-- session would be for $0 and `create_rsvp` refuses it (PA007). The constraint
-- is what makes that state unreachable rather than merely handled, and it also
-- stops someone clearing the fee on an event that is already selling.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.events'::regclass
       and conname = 'events_payment_requires_fee'
  ) then
    alter table public.events
      add constraint events_payment_requires_fee
      check (not payment_required or (fee is not null and fee > 0));
  end if;
end $$;

comment on column public.events.payment_required is
  'When true, a seat is only confirmed once the fee has been paid — create_rsvp books it as pending and the Stripe webhook completes it. False (the default) is the historical behaviour: fee is a published figure, RSVP is free, anything owed is settled at the door.';

-- UPDATE on events is granted column by column — the table-wide grant is
-- revoked so an admin cannot reach reserved_spots — and a new column is not
-- covered by the earlier list. Without this an admin could set
-- payment_required when creating an event and never turn it off again, which
-- is the trap both collect_media_consent and fee had to be dug out of.
grant update (payment_required) on public.events to authenticated;

-- ---------------------------------------------------------------------------
-- The payment lifecycle on rsvps
-- ---------------------------------------------------------------------------

alter table public.rsvps
  add column if not exists payment_status text not null default 'not_required',
  -- Integer cents, never a float, for the same reason donations.amount_cents
  -- is: 0.1 + 0.2 has no place in money. Null on a free booking — zero would
  -- read as "a $0.00 ticket was issued", which is a different claim.
  add column if not exists amount_cents integer,
  add column if not exists stripe_session_id text,
  add column if not exists stripe_payment_intent text,
  add column if not exists payment_method text,
  add column if not exists paid_at timestamptz,
  -- When the seats go back if nobody pays. Null unless the row is pending.
  add column if not exists hold_expires_at timestamptz,
  -- Who pressed "mark as paid" in the admin panel, for the cash and cheque
  -- bookings that never pass through Stripe. Null on anything Stripe settled.
  add column if not exists marked_paid_by uuid references auth.users (id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.rsvps'::regclass
       and conname = 'rsvps_payment_status_check'
  ) then
    alter table public.rsvps
      add constraint rsvps_payment_status_check
      check (payment_status in ('not_required', 'pending', 'paid', 'failed', 'refunded'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.rsvps'::regclass
       and conname = 'rsvps_payment_method_check'
  ) then
    alter table public.rsvps
      add constraint rsvps_payment_method_check
      check (payment_method is null or payment_method in ('card', 'cash', 'check', 'waived'));
  end if;

  -- A pending row without a deadline is a seat held forever: the sweeper below
  -- finds nothing to release and the event fills up with carts nobody paid
  -- for. This is the constraint that makes "pending" mean "pending until".
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.rsvps'::regclass
       and conname = 'rsvps_pending_has_deadline'
  ) then
    alter table public.rsvps
      add constraint rsvps_pending_has_deadline
      check (payment_status <> 'pending' or hold_expires_at is not null);
  end if;
end $$;

comment on column public.rsvps.payment_status is
  'not_required (free, or a fee settled at the door) | pending (seats held, awaiting Stripe) | paid | failed (hold expired or abandoned, seats released) | refunded (money returned, seats released).';
comment on column public.rsvps.amount_cents is
  'What this booking owed, in cents: the event fee times the party size. Null on a booking that was never priced — not zero, which would read as an issued $0 ticket.';
comment on column public.rsvps.payment_method is
  'card = settled through Stripe. cash/check = taken in person and recorded by an admin. waived = admitted without paying. Only a card row may ever be marked refunded, and only by the Stripe webhook.';
comment on column public.rsvps.hold_expires_at is
  'When a pending booking gives its seats back. Set about five minutes beyond the Stripe session deadline so the session always dies first — see create_rsvp.';

-- Stripe's session id is the handle the webhook and the thank-you screen both
-- look a booking up by, so it has to be unique. A partial index rather than a
-- column constraint only because every pre-existing row is null.
create unique index if not exists rsvps_stripe_session_idx
  on public.rsvps (stripe_session_id)
  where stripe_session_id is not null;

create index if not exists rsvps_payment_intent_idx
  on public.rsvps (stripe_payment_intent)
  where stripe_payment_intent is not null;

-- Finding the holds to release, without scanning every RSVP ever taken.
create index if not exists rsvps_expiring_holds_idx
  on public.rsvps (hold_expires_at)
  where payment_status = 'pending';

-- ---------------------------------------------------------------------------
-- One email, one seat — but a failed payment must not lock someone out
-- ---------------------------------------------------------------------------
--
-- The original index was unconditional: one row per (event, email), full stop.
-- That is still what stops a double-submitted form and one person quietly
-- taking a whole event's allocation. But it now also describes a trap — pay
-- with a card that declines, and the abandoned row would bar you from ever
-- trying again, on the event you had just tried to pay for. The same is true
-- of a refund: it ends the booking, so it must also free the address to book
-- anew.
--
-- Making it partial keeps the guard exactly where it bites (a live booking,
-- paid or pending) and lifts it off the two statuses that mean "this booking
-- is over". The dead rows stay in the table: a hold that expired is part of
-- the organisation's record of who tried to come.

drop index if exists public.rsvps_unique_email_per_event_idx;

create unique index rsvps_unique_email_per_event_idx
  on public.rsvps (event_id, lower(email))
  where payment_status not in ('failed', 'refunded');

-- ---------------------------------------------------------------------------
-- release_expired_rsvp_holds — the seats come back
-- ---------------------------------------------------------------------------
--
-- Called with an event id by `create_rsvp`, before it decides whether the
-- event is full: the one moment where a stale hold does real damage is when it
-- turns somebody away from a seat that is not actually taken. Called with null
-- by whoever wants to sweep everything — `supabase/functions` does not, and
-- there is no cron job; the lazy call is what makes this correct without one.
-- The consequence of having no sweeper is cosmetic and bounded: a public
-- listing can show an event fuller than it is for up to the length of a hold.
--
-- Returns the number of seats released, so the caller can adjust a row it has
-- already read rather than re-selecting it.

create or replace function public.release_expired_rsvp_holds(p_event_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row      record;
  v_released integer := 0;
begin
  -- A full sweep is the per-event case run in a loop, not one set-based
  -- UPDATE. That costs a statement per event and buys the lock order every
  -- other writer here uses — the event row, then its bookings. A single
  -- UPDATE across all events would take booking locks first and in whatever
  -- order it happened to visit them, which is a deadlock against anybody
  -- booking one of those events at the same moment. `order by event_id` keeps
  -- two concurrent sweeps in step with each other for the same reason.
  if p_event_id is null then
    for v_row in
      select distinct event_id
        from public.rsvps
       where payment_status = 'pending'
         and hold_expires_at <= now()
       order by event_id
    loop
      v_released := v_released + public.release_expired_rsvp_holds(v_row.event_id);
    end loop;

    return v_released;
  end if;

  -- The event first. `create_rsvp` already holds this lock when it calls in —
  -- re-taking a row lock inside the same transaction is a no-op — and anyone
  -- else calling this needs it taken here.
  perform 1 from public.events where id = p_event_id for update;

  with released as (
    update public.rsvps
       set payment_status = 'failed',
           hold_expires_at = null
     where payment_status = 'pending'
       and hold_expires_at <= now()
       and event_id = p_event_id
    returning guest_count
  )
  select coalesce(sum(guest_count + 1), 0)::integer into v_released from released;

  if v_released > 0 then
    -- greatest(0, …) rather than a bare subtraction: the count is the thing
    -- every capacity decision is made from, and a negative one would advertise
    -- more seats than the room holds. If this ever clamps, the arithmetic has
    -- drifted somewhere and overbooking is the failure we are avoiding.
    update public.events
       set reserved_spots = greatest(0, reserved_spots - v_released)
     where id = p_event_id;
  end if;

  return v_released;
end;
$$;

comment on function public.release_expired_rsvp_holds(uuid) is
  'Marks every pending booking past its deadline as failed and returns its seats to the event. Called by create_rsvp for one event before the capacity check; safe to call with null to sweep all of them.';

-- Nobody outside the database calls this, so nobody outside it may. In
-- PostgreSQL a new function is granted EXECUTE to PUBLIC by default, and
-- revoking from `anon, authenticated` alone would leave that grant standing —
-- privileges are a union, and PUBLIC covers both roles.
revoke execute on function public.release_expired_rsvp_holds(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_rsvp — now decides whether the seat is paid for
-- ---------------------------------------------------------------------------
--
-- Replaced rather than dropped and recreated: the argument list is unchanged,
-- so there is no overload to go ambiguous. That is deliberate. Nothing a
-- client sends decides whether this booking must be paid for, or how much —
-- both come from the event row. A price in the request body would be a price
-- the browser could edit.
--
-- Everything that was here before is carried over verbatim: the guest-count
-- and consent validation, the language fallback, the FOR UPDATE lock that is
-- what stops two simultaneous bookings overselling the last seat, PA006 for
-- an event that is already over.

create or replace function public.create_rsvp(
  p_event_id          uuid,
  p_full_name         text,
  p_email             text,
  p_phone             text default null,
  p_guest_count       integer default 0,
  p_optional_donation numeric default 0,
  p_media_consent     text default null,
  p_language          text default 'en'
)
returns public.rsvps
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event    public.events;
  v_seats    integer;
  v_reserved integer;
  v_rsvp     public.rsvps;
  v_consent  text;
  v_language text;
  v_status   text;
  v_amount   integer;
  v_hold     timestamptz;
begin
  if p_guest_count is null or p_guest_count < 0 or p_guest_count > 10 then
    raise exception 'invalid_guest_count' using errcode = 'PA004';
  end if;

  v_consent := nullif(btrim(coalesce(p_media_consent, '')), '');

  if v_consent is not null and v_consent not in ('yes', 'photos_only', 'no') then
    raise exception 'invalid_media_consent' using errcode = 'PA005';
  end if;

  -- An unrecognised language falls back to English rather than being rejected.
  -- Getting the confirmation in the wrong language is a poor outcome; losing
  -- the booking over it is a worse one, and the CHECK constraint would turn
  -- this into exactly that.
  v_language := lower(btrim(coalesce(p_language, '')));
  if v_language not in ('en', 'es') then
    v_language := 'en';
  end if;

  -- Locks the row for the rest of the transaction; a concurrent create_rsvp
  -- for the same event blocks here and re-reads the updated count.
  select * into v_event
    from public.events
   where id = p_event_id and published
   for update;

  if not found then
    raise exception 'event_not_found' using errcode = 'PA003';
  end if;

  if coalesce(v_event.ends_at, v_event.starts_at) <= now() then
    raise exception 'event_over' using errcode = 'PA006';
  end if;

  -- Enforced here rather than in the browser: the form is the polite ask, but
  -- anyone can call this RPC directly, and a booking with no recorded answer
  -- is exactly what this feature exists to prevent.
  if v_event.collect_media_consent and v_consent is null then
    raise exception 'media_consent_required' using errcode = 'PA005';
  end if;

  -- Ignore an answer the event never asked for, so a stale client cannot
  -- write a consent value that no one was actually shown the terms for.
  if not v_event.collect_media_consent then
    v_consent := null;
  end if;

  -- The attendee occupies a seat too, hence +1.
  v_seats := p_guest_count + 1;

  if v_event.payment_required then
    -- Unreachable while events_payment_requires_fee stands, and checked anyway:
    -- the alternative to raising here is booking a seat against a Checkout
    -- session for nothing, which looks to the visitor exactly like a free
    -- ticket and to the organiser exactly like a sold one.
    if v_event.fee is null or v_event.fee <= 0 then
      raise exception 'event_payment_misconfigured' using errcode = 'PA007';
    end if;

    v_status := 'pending';
    v_amount := round(v_event.fee * 100)::integer * v_seats;

    -- Two deadlines exist and the order between them is what keeps this
    -- honest: Stripe's session must die *before* the seat is released, or a
    -- payment could land on a seat already given to somebody else.
    --
    -- The hold is 35 minutes and create-ticket-session sets Stripe's
    -- `expires_at` two minutes short of it. 35 rather than 30 because
    -- Stripe refuses an `expires_at` less than 30 minutes out and this row is
    -- written first — a flat 30 here would leave the Edge Function asking for
    -- 29-something and being turned down. What the visitor is told is "about
    -- half an hour", which both numbers honour.
    v_hold := now() + interval '35 minutes';
  else
    v_status := 'not_required';
  end if;

  -- Abandoned carts are not occupied seats. Releasing them here — with the
  -- event row already locked, so no concurrent booking can be reading the
  -- count mid-flight — is what stops a visitor being told an event is full
  -- because of three people who closed Stripe's page half an hour ago.
  v_reserved := v_event.reserved_spots - public.release_expired_rsvp_holds(p_event_id);

  if v_reserved + v_seats > v_event.total_spots then
    raise exception 'event_full' using errcode = 'PA001';
  end if;

  begin
    insert into public.rsvps (
      event_id, full_name, email, phone, guest_count, optional_donation,
      media_consent, language, payment_status, amount_cents, hold_expires_at
    )
    values (
      p_event_id,
      btrim(p_full_name),
      lower(btrim(p_email)),
      nullif(btrim(coalesce(p_phone, '')), ''),
      p_guest_count,
      coalesce(p_optional_donation, 0),
      v_consent,
      v_language,
      v_status,
      v_amount,
      v_hold
    )
    returning * into v_rsvp;
  exception when unique_violation then
    raise exception 'already_registered' using errcode = 'PA002';
  end;

  update public.events
     set reserved_spots = v_reserved + v_seats
   where id = p_event_id;

  return v_rsvp;
end;
$$;

-- Anonymous visitors must be able to RSVP; that is the whole point.
grant execute on function public.create_rsvp(uuid, text, text, text, integer, numeric, text, text)
  to anon, authenticated;

-- And `create-ticket-session` calls it with the service role, which is new:
-- until tickets existed, this function was only ever reached from the browser.
-- Granted explicitly rather than left to Supabase's default privileges. Those
-- do grant functions to service_role, but so does PostgreSQL's own default
-- grant to PUBLIC, and the revokes below strip PUBLIC from the functions
-- beside this one. A privilege that works only because nobody has tightened
-- the defaults is a privilege that disappears the day somebody does.
grant execute on function public.create_rsvp(uuid, text, text, text, integer, numeric, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- mark_rsvp_paid — the only way a booking becomes paid
-- ---------------------------------------------------------------------------
--
-- Called by the Stripe webhook, which is the only party that knows a payment
-- succeeded. Idempotent, because Stripe retries a webhook it did not get a
-- 200 from and will happily deliver the same event twice.
--
-- The interesting case is a row that is no longer pending. A visitor who pays
-- in the last seconds of their session can have the money arrive after the
-- hold was released, and the answer cannot be "keep the money, lose the seat".
-- So the seats are taken back, and if that pushes the event over its own
-- capacity it goes over by that much and says so in the log. One extra chair
-- in the room is a smaller problem than a paid attendee turned away at it.

create or replace function public.mark_rsvp_paid(
  p_rsvp_id         uuid,
  p_payment_intent  text default null,
  p_method          text default 'card'
)
returns public.rsvps
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rsvp     public.rsvps;
  v_event    public.events;
  v_event_id uuid;
  v_seats    integer;
begin
  -- Read unlocked, only to learn which event to lock. The order is the rule
  -- this schema holds to everywhere — the event row, then its bookings —
  -- because `create_rsvp` takes the event first and a function that took them
  -- the other way round would deadlock against a concurrent booking of the
  -- same event. That is precisely the moment this function runs in.
  select event_id into v_event_id from public.rsvps where id = p_rsvp_id;
  if not found then
    raise exception 'rsvp_not_found' using errcode = 'PA008';
  end if;

  select * into v_event from public.events where id = v_event_id for update;

  select * into v_rsvp from public.rsvps where id = p_rsvp_id for update;

  if v_rsvp.payment_status = 'paid' then
    return v_rsvp;
  end if;

  v_seats := v_rsvp.guest_count + 1;

  -- Re-take the seats this booking had already given back.
  if v_rsvp.payment_status in ('failed', 'refunded') then
    update public.events
       set reserved_spots = reserved_spots + v_seats
     where id = v_event_id;

    if v_event.reserved_spots + v_seats > v_event.total_spots then
      raise warning '[PAWTX] event % is overbooked by % seat(s): payment for rsvp % landed after its hold was released',
        v_event_id, (v_event.reserved_spots + v_seats) - v_event.total_spots, p_rsvp_id;
    end if;
  end if;

  update public.rsvps
     set payment_status        = 'paid',
         paid_at               = coalesce(paid_at, now()),
         stripe_payment_intent = coalesce(p_payment_intent, stripe_payment_intent),
         payment_method        = coalesce(p_method, 'card'),
         -- A paid seat has no deadline, and the CHECK only demands one of a
         -- pending row. Leaving it set would keep the row in the sweeper's
         -- sights for no reason.
         hold_expires_at       = null
   where id = p_rsvp_id
  returning * into v_rsvp;

  return v_rsvp;
end;
$$;

comment on function public.mark_rsvp_paid(uuid, text, text) is
  'Confirms a booking once its fee has been paid, re-taking the seats if the hold had already lapsed. Idempotent. Called by the stripe-webhook Edge Function with the service role.';

revoke execute on function public.mark_rsvp_paid(uuid, text, text) from public, anon, authenticated;
-- The Stripe webhook is the caller, under the service role.
grant execute on function public.mark_rsvp_paid(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- release_rsvp_hold — give one booking's seats back now
-- ---------------------------------------------------------------------------
--
-- Two callers, both in the Edge Functions. `stripe-webhook` calls it on
-- checkout.session.expired, which is Stripe saying the visitor will not be
-- paying. `create-ticket-session` calls it when somebody comes back to pay for
-- a booking they already started, so the retry is not refused by the one-row-
-- per-email index — and it expires the old Stripe session first, which is the
-- half of that cleanup this function cannot do.

create or replace function public.release_rsvp_hold(p_rsvp_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rsvp     public.rsvps;
  v_event_id uuid;
begin
  -- Event row first, then the booking — see mark_rsvp_paid for why.
  select event_id into v_event_id from public.rsvps where id = p_rsvp_id;
  if not found then
    return false;
  end if;

  perform 1 from public.events where id = v_event_id for update;

  select * into v_rsvp from public.rsvps where id = p_rsvp_id for update;

  if v_rsvp.payment_status <> 'pending' then
    -- Not an error: a hold the sweeper already released, or a booking that was
    -- paid for in the meantime, both land here and both are fine as they are.
    -- This is also what makes a duplicate Stripe delivery harmless.
    return false;
  end if;

  update public.rsvps
     set payment_status  = 'failed',
         hold_expires_at = null
   where id = p_rsvp_id;

  update public.events
     set reserved_spots = greatest(0, reserved_spots - (v_rsvp.guest_count + 1))
   where id = v_event_id;

  return true;
end;
$$;

comment on function public.release_rsvp_hold(uuid) is
  'Releases one pending booking and returns its seats. No-op on a row that is not pending, so a duplicate Stripe delivery cannot release the same seats twice.';

revoke execute on function public.release_rsvp_hold(uuid) from public, anon, authenticated;
-- Called by stripe-webhook on an expired session, and by create-ticket-session
-- when it clears a previous attempt before booking a fresh one.
grant execute on function public.release_rsvp_hold(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- mark_rsvp_refunded — the money went back, so does the seat
-- ---------------------------------------------------------------------------
--
-- Keyed on the payment intent rather than the row id because that is all
-- charge.refunded carries, and it is the same handle the donations table is
-- refunded by. Returns the number of bookings affected: zero is the normal
-- answer for a refunded *donation*, since the webhook tries both tables.

create or replace function public.mark_rsvp_refunded(p_payment_intent text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row   record;
  v_rsvp  public.rsvps;
  v_count integer := 0;
begin
  if p_payment_intent is null or btrim(p_payment_intent) = '' then
    return 0;
  end if;

  -- The candidates are collected unlocked, then each is taken event-first, for
  -- the lock order described in mark_rsvp_paid. In practice one payment intent
  -- means one booking; the loop is here because nothing in the schema promises
  -- that, and a refund that silently handled only the first row would leave a
  -- seat sold and paid for by money that has gone back.
  for v_row in
    select id, event_id
      from public.rsvps
     where stripe_payment_intent = p_payment_intent
       and payment_status in ('paid', 'pending')
     order by id
  loop
    perform 1 from public.events where id = v_row.event_id for update;

    select * into v_rsvp from public.rsvps where id = v_row.id for update;

    -- Re-checked under the lock: the status may have moved since the unlocked
    -- read above, and a second refund event for the same charge must not
    -- release the same seats twice.
    if v_rsvp.payment_status in ('paid', 'pending') then
      update public.rsvps
         set payment_status  = 'refunded',
             hold_expires_at = null
       where id = v_rsvp.id;

      update public.events
         set reserved_spots = greatest(0, reserved_spots - (v_rsvp.guest_count + 1))
       where id = v_rsvp.event_id;

      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

comment on function public.mark_rsvp_refunded(text) is
  'Marks the booking behind a refunded Stripe charge as refunded and frees its seats, so the place goes to the next person. Returns 0 when the charge was a donation rather than a ticket.';

revoke execute on function public.mark_rsvp_refunded(text) from public, anon, authenticated;
grant execute on function public.mark_rsvp_refunded(text) to service_role;

-- ---------------------------------------------------------------------------
-- admin_set_rsvp_payment — cash at the door, and the undo for a misclick
-- ---------------------------------------------------------------------------
--
-- A nonprofit in Odessa cannot make a card the only way into a room. Somebody
-- will hand over cash, post a cheque, or be waved in, and the roster has to be
-- able to say so — otherwise the admin panel shows an unpaid booking for a
-- person who has paid, and the seat count is wrong in the direction that sells
-- the chair twice.
--
-- It refuses to touch a booking Stripe settled. Those rows are mirrored in
-- Stripe's own records and in a card statement; flipping one by hand would
-- make this table disagree with both, and the one thing a payment record must
-- never do is disagree quietly. A card payment is corrected in Stripe, and the
-- webhook brings the correction back.

create or replace function public.admin_set_rsvp_payment(
  p_rsvp_id uuid,
  p_paid    boolean,
  p_method  text default 'cash'
)
returns public.rsvps
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rsvp     public.rsvps;
  v_event_id uuid;
  v_method   text;
begin
  if not public.is_admin() then
    raise exception 'not_authorised' using errcode = '42501';
  end if;

  -- Event row first, then the booking — see mark_rsvp_paid for why. This
  -- function adjusts reserved_spots on the un-marking path and hands over to
  -- mark_rsvp_paid on the other, so it needs the same order as both.
  select event_id into v_event_id from public.rsvps where id = p_rsvp_id;
  if not found then
    raise exception 'rsvp_not_found' using errcode = 'PA008';
  end if;

  perform 1 from public.events where id = v_event_id for update;

  select * into v_rsvp from public.rsvps where id = p_rsvp_id for update;

  if v_rsvp.payment_method = 'card' then
    raise exception 'stripe_payment_not_editable' using errcode = 'PA009';
  end if;

  if p_paid then
    v_method := coalesce(nullif(btrim(p_method), ''), 'cash');
    if v_method not in ('cash', 'check', 'waived') then
      raise exception 'invalid_payment_method' using errcode = 'PA010';
    end if;

    -- Shares every bit of the seat arithmetic with the Stripe path, including
    -- re-taking a lapsed hold, because a seat confirmed in cash is confirmed
    -- in exactly the same sense as one confirmed by card.
    return public.mark_rsvp_paid(p_rsvp_id, null, v_method);
  end if;

  -- Un-marking: back to whatever this booking was before someone said it was
  -- paid. A priced event returns to failed (its hold is long gone, and the
  -- partial unique index lets the attendee book again); an event whose fee is
  -- settled at the door returns to not_required, which is where it started.
  --
  -- Whether the seats come back is decided by the status this row is leaving,
  -- not the one it arrives at. Pressed twice on an already-failed booking, a
  -- check on the new status would subtract the same seats again and hand the
  -- room places it does not have.
  declare
    v_was_holding boolean := v_rsvp.payment_status in ('paid', 'pending');
  begin
    update public.rsvps
       set payment_status = case
                              when amount_cents is null then 'not_required'
                              else 'failed'
                            end,
           paid_at         = null,
           payment_method  = null,
           marked_paid_by  = null,
           hold_expires_at = null
     where id = p_rsvp_id
    returning * into v_rsvp;

    -- not_required holds its seats the way it always did — that booking is
    -- still a booking, it simply owes nothing through this site.
    if v_was_holding and v_rsvp.payment_status = 'failed' then
      update public.events
         set reserved_spots = greatest(0, reserved_spots - (v_rsvp.guest_count + 1))
       where id = v_rsvp.event_id;
    end if;
  end;

  return v_rsvp;
end;
$$;

comment on function public.admin_set_rsvp_payment(uuid, boolean, text) is
  'Records a fee taken in cash or by cheque, waives one, or undoes either. Refuses any booking Stripe settled — correct those in Stripe and let the webhook catch up.';

revoke execute on function public.admin_set_rsvp_payment(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_rsvp_payment(uuid, boolean, text) to authenticated;

-- `marked_paid_by` is set from inside the function rather than taken as an
-- argument, so it records who actually called it. SECURITY DEFINER does not
-- change auth.uid() — that reads the request's JWT, not the function owner.
create or replace function public.rsvps_stamp_marked_paid_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_status = 'paid'
     and new.payment_method in ('cash', 'check', 'waived')
     and new.marked_paid_by is null then
    new.marked_paid_by := auth.uid();
  end if;

  return new;
end;
$$;

revoke execute on function public.rsvps_stamp_marked_paid_by() from public, anon, authenticated;

drop trigger if exists stamp_marked_paid_by on public.rsvps;

create trigger stamp_marked_paid_by
  before update of payment_status on public.rsvps
  for each row
  execute function public.rsvps_stamp_marked_paid_by();

-- ---------------------------------------------------------------------------
-- The confirmation email now waits for the money
-- ---------------------------------------------------------------------------
--
-- `send_rsvp_confirmation` fired on every INSERT, which was right while every
-- booking was confirmed the moment it existed. A pending ticket is not: the
-- visitor is still on Stripe's page, and "You're registered!" would be a
-- promise about a seat that is about to be given away. So the insert trigger
-- now skips pending rows, and a second trigger sends the same email when the
-- payment lands.
--
-- Both point at the same function. It reported `type: 'INSERT'` hard-coded;
-- it now reports the real operation, since one of the two callers is not an
-- insert and a payload that misdescribes itself is a trap for whoever reads
-- the function next.

create or replace function public.notify_rsvp_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The dispatch is wrapped because this runs *inside* the booking's
  -- transaction: an unhandled error here would roll back the INSERT, and
  -- create_rsvp would report a failure to someone whose seat was fine. Mail is
  -- the courtesy; the booking is the thing that matters. Same reasoning as
  -- sendEmail() swallowing a missing RESEND_API_KEY.
  begin
    perform net.http_post(
      url := 'https://zusgxrezbffxxhztggev.supabase.co/functions/v1/send-rsvp-confirmation',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1c2d4cmV6YmZmeHhoenRnZ2V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwOTk2NDgsImV4cCI6MjEwMDY3NTY0OH0.lTfRJ2T-IhHGLH1RvGjFAbYrYeJ5xY05EB_UIA4kIyE'
      ),
      -- Shaped like the dashboard's own payload, because the function already
      -- reads `record` out of it and should not have to care which built it.
      body := jsonb_build_object(
        'type', tg_op,
        'table', 'rsvps',
        'schema', 'public',
        'record', to_jsonb(new),
        'old_record', case when tg_op = 'UPDATE' then to_jsonb(old) else null end
      ),
      timeout_milliseconds := 10000
    );
  exception when others then
    raise warning '[PAWTX] could not queue the RSVP confirmation: %', sqlerrm;
  end;

  return new;
end;
$$;

comment on function public.notify_rsvp_confirmation() is
  'Posts a confirmed RSVP to send-rsvp-confirmation. pg_net queues the request and returns immediately, so the booking is never held up waiting on mail. Fires on insert for a booking that needs no payment, and on the update that marks a prepaid one paid.';

drop trigger if exists send_rsvp_confirmation on public.rsvps;

create trigger send_rsvp_confirmation
  after insert on public.rsvps
  for each row
  when (new.payment_status in ('not_required', 'paid'))
  execute function public.notify_rsvp_confirmation();

-- Narrower than "became paid" on purpose. `pending -> paid` is the moment a
-- prepaid seat first becomes real, and `failed -> paid` is an admin taking
-- cash for a booking whose hold had already lapsed — in both cases the
-- attendee has had no confirmation yet. A `not_required -> paid` booking has
-- had one since the day it was made (its fee is collected at the door, and
-- recording that cash is bookkeeping, not news), so it is left out: a second
-- "You're registered!" about a seat somebody has held for a fortnight reads
-- as a duplicate booking.
drop trigger if exists send_rsvp_confirmation_on_payment on public.rsvps;

create trigger send_rsvp_confirmation_on_payment
  after update of payment_status on public.rsvps
  for each row
  when (old.payment_status in ('pending', 'failed') and new.payment_status = 'paid')
  execute function public.notify_rsvp_confirmation();
