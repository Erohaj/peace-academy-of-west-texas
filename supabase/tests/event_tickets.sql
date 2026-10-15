-- Exercises the prepaid-ticket lifecycle against a real Postgres.
--
-- Every check is an ASSERT: the script either runs to "ALL TICKET TESTS
-- PASSED" or stops on the first thing that is not true. Run with
--   psql -v ON_ERROR_STOP=1 -f ticket_tests.sql
-- so a failure is an exit code and not a line somebody has to spot in the log.

\set ON_ERROR_STOP on
\timing off

-- Anything a previous run left behind, so this file can be re-run without a
-- full `supabase db reset` between attempts.
delete from public.rsvps where email in ('ada@example.com', 'grace@example.com',
  'katherine@example.com', 'mary@example.com', 'dorothy@example.com');
delete from public.events where title in ('TEST prepaid workshop', 'TEST door fee dinner',
  'Unpriced prepaid', 'Free prepaid');

-- ===========================================================================
-- 1. Grants: nothing here may be callable by a visitor
-- ===========================================================================
do $$
begin
  assert not has_function_privilege('anon', 'public.mark_rsvp_paid(uuid,text,text)', 'execute'),
    'anon can call mark_rsvp_paid -- a visitor could confirm their own seat without paying';
  assert not has_function_privilege('anon', 'public.release_rsvp_hold(uuid)', 'execute'),
    'anon can call release_rsvp_hold';
  assert not has_function_privilege('anon', 'public.mark_rsvp_refunded(text)', 'execute'),
    'anon can call mark_rsvp_refunded';
  assert not has_function_privilege('anon', 'public.release_expired_rsvp_holds(uuid)', 'execute'),
    'anon can call release_expired_rsvp_holds';
  assert (select count(*) from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'admin_set_rsvp_payment') = 0,
    'admin_set_rsvp_payment still exists -- payments are Stripe''s alone now';
  assert not has_function_privilege('authenticated', 'public.mark_rsvp_paid(uuid,text,text)', 'execute'),
    'authenticated can call mark_rsvp_paid';
  assert has_function_privilege('service_role', 'public.mark_rsvp_paid(uuid,text,text)', 'execute'),
    'service_role cannot call mark_rsvp_paid -- the webhook could not confirm a payment';
  assert has_function_privilege('service_role', 'public.create_rsvp(uuid,text,text,text,integer,numeric,text,text)', 'execute'),
    'service_role cannot call create_rsvp -- create-ticket-session could not book a seat';
  assert has_function_privilege('anon', 'public.create_rsvp(uuid,text,text,text,integer,numeric,text,text)', 'execute'),
    'anon cannot call create_rsvp -- nobody could RSVP at all';
  raise notice '1. grants OK';
end $$;

-- ===========================================================================
-- 2. The constraint that keeps a prepaid event priced
-- ===========================================================================
do $$
declare
  v_failed boolean := false;
begin
  begin
    insert into public.events (title, title_es, description, description_es,
      starts_at, location, category, total_spots, fee, payment_required)
    values ('Unpriced prepaid', 'x', 'x', 'x', now() + interval '10 days',
      'Odessa', 'cooking', 10, null, true);
  exception when check_violation then
    v_failed := true;
  end;

  assert v_failed, 'an event was marked prepaid with no fee -- Checkout would be for $0';

  v_failed := false;
  begin
    insert into public.events (title, title_es, description, description_es,
      starts_at, location, category, total_spots, fee, payment_required)
    values ('Free prepaid', 'x', 'x', 'x', now() + interval '10 days',
      'Odessa', 'cooking', 10, 0, true);
  exception when check_violation then
    v_failed := true;
  end;

  assert v_failed, 'an event was marked prepaid with a zero fee';
  raise notice '2. events_payment_requires_fee OK';
end $$;

-- ===========================================================================
-- 3. A prepaid booking holds its seats and is priced per attendee
-- ===========================================================================
do $$
declare
  v_event_id uuid;
  v_rsvp     public.rsvps;
  v_reserved integer;
begin
  insert into public.events (title, title_es, description, description_es,
    starts_at, location, category, total_spots, fee, payment_required, published)
  values ('TEST prepaid workshop', 'TEST', 'x', 'x', now() + interval '10 days',
    'Odessa', 'cooking', 3, 20, true, true)
  returning id into v_event_id;

  -- One attendee plus one guest = two seats at $20.
  v_rsvp := public.create_rsvp(v_event_id, 'Ada Lovelace', 'ada@example.com',
    null, 1, 0, null, 'en');

  assert v_rsvp.payment_status = 'pending',
    format('expected pending, got %s', v_rsvp.payment_status);
  assert v_rsvp.amount_cents = 4000,
    format('expected 4000 cents (2 x $20), got %s', v_rsvp.amount_cents);
  assert v_rsvp.hold_expires_at between now() + interval '30 minutes'
                                    and now() + interval '40 minutes',
    format('hold deadline out of range: %s', v_rsvp.hold_expires_at);
  assert v_rsvp.paid_at is null, 'a pending booking has a paid_at';
  assert v_rsvp.payment_method is null, 'a pending booking has a payment method';

  select reserved_spots into v_reserved from public.events where id = v_event_id;
  assert v_reserved = 2, format('expected 2 seats held, got %s', v_reserved);

  raise notice '3. pending hold, price and seat count OK (rsvp %)', v_rsvp.id;
end $$;

-- ===========================================================================
-- 4. The held seats are really unavailable
-- ===========================================================================
do $$
declare
  v_event_id uuid;
  v_code     text;
begin
  select id into v_event_id from public.events where title = 'TEST prepaid workshop';

  -- Two more seats in a room of three, one of which is still free.
  begin
    perform public.create_rsvp(v_event_id, 'Grace Hopper', 'grace@example.com',
      null, 1, 0, null, 'en');
    assert false, 'a booking that should not have fitted was accepted';
  exception when others then
    v_code := sqlstate;
  end;

  assert v_code = 'PA001', format('expected PA001 event_full, got %s', v_code);

  -- The last single seat does fit.
  perform public.create_rsvp(v_event_id, 'Grace Hopper', 'grace@example.com',
    null, 0, 0, null, 'es');

  assert (select reserved_spots from public.events where id = v_event_id) = 3,
    'the event is not full after its last seat was taken';

  raise notice '4. capacity holds against pending bookings OK';
end $$;

-- ===========================================================================
-- 5. Payment confirms the seat without changing the count
-- ===========================================================================
do $$
declare
  v_rsvp public.rsvps;
begin
  select * into v_rsvp from public.rsvps where email = 'ada@example.com';

  v_rsvp := public.mark_rsvp_paid(v_rsvp.id, 'pi_test_ada', 'card');

  assert v_rsvp.payment_status = 'paid', 'the payment did not confirm the booking';
  assert v_rsvp.paid_at is not null, 'paid_at was not stamped';
  assert v_rsvp.hold_expires_at is null, 'a paid booking still carries a deadline';
  assert v_rsvp.payment_method = 'card', 'the payment method was not recorded';
  assert v_rsvp.stripe_payment_intent = 'pi_test_ada', 'the payment intent was not recorded';

  assert (select reserved_spots from public.events
           where title = 'TEST prepaid workshop') = 3,
    'confirming an already-held seat changed the count';

  -- Stripe retries. The second delivery must be a no-op.
  v_rsvp := public.mark_rsvp_paid(v_rsvp.id, 'pi_test_ada', 'card');
  assert (select reserved_spots from public.events
           where title = 'TEST prepaid workshop') = 3,
    'a duplicate webhook delivery double-counted the seats';

  raise notice '5. mark_rsvp_paid and its idempotency OK';
end $$;

-- ===========================================================================
-- 6. An expired hold gives the seats back
-- ===========================================================================
do $$
declare
  v_event_id uuid;
  v_grace    uuid;
  v_released integer;
begin
  select id into v_event_id from public.events where title = 'TEST prepaid workshop';
  select id into v_grace from public.rsvps where email = 'grace@example.com';

  -- Stand in for half an hour passing.
  update public.rsvps set hold_expires_at = now() - interval '1 minute'
   where id = v_grace;

  v_released := public.release_expired_rsvp_holds(v_event_id);

  assert v_released = 1, format('expected 1 seat released, got %s', v_released);
  assert (select payment_status from public.rsvps where id = v_grace) = 'failed',
    'the expired booking was not marked failed';
  assert (select hold_expires_at from public.rsvps where id = v_grace) is null,
    'a released booking still carries a deadline';
  assert (select reserved_spots from public.events where id = v_event_id) = 2,
    'the seats did not come back';

  -- Called twice, it must not release them again.
  assert public.release_expired_rsvp_holds(v_event_id) = 0,
    'the sweep released the same seats twice';
  assert (select reserved_spots from public.events where id = v_event_id) = 2,
    'a second sweep changed the count';

  raise notice '6. expired holds release OK';
end $$;

-- ===========================================================================
-- 7. A failed payment does not lock the address out
-- ===========================================================================
do $$
declare
  v_event_id uuid;
  v_rsvp     public.rsvps;
begin
  select id into v_event_id from public.events where title = 'TEST prepaid workshop';

  -- Same address as the booking that just failed. The partial unique index is
  -- what makes this possible; the old one would raise PA002 here.
  v_rsvp := public.create_rsvp(v_event_id, 'Grace Hopper', 'grace@example.com',
    null, 0, 0, null, 'es');

  assert v_rsvp.payment_status = 'pending', 'the retry was not booked as pending';
  assert v_rsvp.language = 'es', 'the language was not carried through';
  assert (select count(*) from public.rsvps where email = 'grace@example.com') = 2,
    'the failed attempt was not kept as a record';
  assert (select reserved_spots from public.events where id = v_event_id) = 3,
    'the retry did not take a seat';

  -- A live booking still blocks a second one.
  --
  -- The room is opened up by one seat first. create_rsvp has always checked
  -- capacity before attempting the insert, so a full event refuses everybody
  -- with PA001 -- including somebody who already holds a seat, who would never
  -- reach the duplicate check. Widening the event is what leaves PA002 as the
  -- only reason left to say no.
  update public.events set total_spots = 4 where id = v_event_id;

  begin
    perform public.create_rsvp(v_event_id, 'Grace Hopper', 'grace@example.com',
      null, 0, 0, null, 'es');
    assert false, 'the same address booked the same event twice';
  exception when sqlstate 'PA002' then
    null;
  end;

  update public.events set total_spots = 3 where id = v_event_id;

  raise notice '7. retry after failure OK, duplicate still refused';
end $$;

-- ===========================================================================
-- 8. release_rsvp_hold, as the webhook calls it
-- ===========================================================================
do $$
declare
  v_event_id uuid;
  v_rsvp_id  uuid;
begin
  select id into v_event_id from public.events where title = 'TEST prepaid workshop';
  select id into v_rsvp_id from public.rsvps
   where email = 'grace@example.com' and payment_status = 'pending';

  assert public.release_rsvp_hold(v_rsvp_id), 'the hold was not released';
  assert (select reserved_spots from public.events where id = v_event_id) = 2,
    'the seat did not come back';

  -- A duplicate checkout.session.expired must do nothing at all.
  assert not public.release_rsvp_hold(v_rsvp_id),
    'releasing an already-released hold reported success';
  assert (select reserved_spots from public.events where id = v_event_id) = 2,
    'a duplicate release took seats away twice';

  -- And it must refuse to touch a booking that was paid for.
  assert not public.release_rsvp_hold(
    (select id from public.rsvps where email = 'ada@example.com')),
    'release_rsvp_hold touched a paid booking';
  assert (select reserved_spots from public.events where id = v_event_id) = 2,
    'releasing a paid booking changed the count';

  raise notice '8. release_rsvp_hold OK';
end $$;

-- ===========================================================================
-- 9. A refund frees the seat
-- ===========================================================================
do $$
declare
  v_event_id uuid;
  v_count    integer;
begin
  select id into v_event_id from public.events where title = 'TEST prepaid workshop';

  v_count := public.mark_rsvp_refunded('pi_test_ada');

  assert v_count = 1, format('expected 1 booking refunded, got %s', v_count);
  assert (select payment_status from public.rsvps where email = 'ada@example.com') = 'refunded',
    'the booking was not marked refunded';
  assert (select reserved_spots from public.events where id = v_event_id) = 0,
    'the refunded seats did not come back';

  -- A second charge.refunded for the same payment must not double-release.
  assert public.mark_rsvp_refunded('pi_test_ada') = 0,
    'a duplicate refund event released seats again';
  assert (select reserved_spots from public.events where id = v_event_id) = 0,
    'the count moved on a duplicate refund';

  -- A refunded donation hits this function too, and must find nothing.
  assert public.mark_rsvp_refunded('pi_a_donation') = 0,
    'a donation refund matched a booking';

  raise notice '9. refunds release the seat OK';
end $$;

-- ===========================================================================
-- 10. A payment that lands after its hold was released
-- ===========================================================================
do $$
declare
  v_event_id uuid;
  v_rsvp     public.rsvps;
  v_reserved integer;
begin
  select id into v_event_id from public.events where title = 'TEST prepaid workshop';

  -- Ada's booking is refunded and her two seats are back in the pool. Paying
  -- it again is the shape of the late-payment race: the money is in, the seats
  -- are not held.
  select * into v_rsvp from public.rsvps where email = 'ada@example.com';
  v_rsvp := public.mark_rsvp_paid(v_rsvp.id, 'pi_test_ada_again', 'card');

  assert v_rsvp.payment_status = 'paid', 'the late payment did not confirm';

  select reserved_spots into v_reserved from public.events where id = v_event_id;
  assert v_reserved = 2, format('the seats were not re-taken, count is %s', v_reserved);

  raise notice '10. a late payment re-takes its seats OK';
end $$;

-- ===========================================================================
-- 12. Nothing changed for a free event, or one paid at the door
-- ===========================================================================
do $$
declare
  v_event_id uuid;
  v_rsvp     public.rsvps;
begin
  insert into public.events (title, title_es, description, description_es,
    starts_at, location, category, total_spots, fee, payment_required, published)
  values ('TEST door fee dinner', 'TEST', 'x', 'x', now() + interval '12 days',
    'Midland', 'cultural', 20, 15, false, true)
  returning id into v_event_id;

  v_rsvp := public.create_rsvp(v_event_id, 'Katherine Johnson',
    'katherine@example.com', '(432) 555-0100', 2, 0, null, 'en');

  assert v_rsvp.payment_status = 'not_required',
    format('a door-fee booking came back as %s', v_rsvp.payment_status);
  assert v_rsvp.amount_cents is null,
    'a booking this site never priced carries an amount';
  assert v_rsvp.hold_expires_at is null, 'a free booking carries a deadline';
  assert (select reserved_spots from public.events where id = v_event_id) = 3,
    'a door-fee booking did not take its seats';

  -- The sweep must never touch it, however long it sits there.
  assert public.release_expired_rsvp_holds(v_event_id) = 0,
    'the sweep released a booking that owes nothing';
  assert (select reserved_spots from public.events where id = v_event_id) = 3,
    'the sweep changed the count on a door-fee event';

  raise notice '11. an event this site takes no money for is unchanged OK';
end $$;

-- ===========================================================================
-- 14. The confirmation email fires on the right transitions and no others
-- ===========================================================================
do $$
declare
  v_event_id uuid;
  v_rsvp     public.rsvps;
  v_before   bigint;
  v_queued   bigint;
begin
  -- pg_net queues each request as a row; counting them is how this asserts
  -- "a letter was sent" without a mail server. If the queue is not readable
  -- here, fall back to reading the trigger definitions below.
  select count(*) into v_before from net.http_request_queue;

  select id into v_event_id from public.events where title = 'TEST prepaid workshop';

  -- A pending booking must queue nothing: the visitor is still on Stripe.
  v_rsvp := public.create_rsvp(v_event_id, 'Mary Jackson', 'mary@example.com',
    null, 0, 0, null, 'en');

  select count(*) into v_queued from net.http_request_queue;
  assert v_queued = v_before,
    'a pending booking sent a confirmation -- it promises a seat that may be released';

  -- Paying it must queue exactly one.
  perform public.mark_rsvp_paid(v_rsvp.id, 'pi_test_mary', 'card');
  select count(*) into v_queued from net.http_request_queue;
  assert v_queued = v_before + 1,
    format('paying queued %s letters, expected 1', v_queued - v_before);

  -- A free booking queues one on insert.
  select id into v_event_id from public.events where title = 'TEST door fee dinner';
  perform public.create_rsvp(v_event_id, 'Dorothy Vaughan', 'dorothy@example.com',
    null, 0, 0, null, 'en');
  select count(*) into v_queued from net.http_request_queue;
  assert v_queued = v_before + 2,
    'a booking that needs no payment did not get its confirmation';

  raise notice '14. confirmation fires on pending->paid and on insert only OK';
end $$;

-- ===========================================================================
-- 15. What 98_verify.sql asserts about this feature
-- ===========================================================================
do $$
begin
  assert (select count(*) from information_schema.columns
           where table_schema = 'public' and table_name = 'events'
             and column_name = 'payment_required') = 1, 'events.payment_required missing';
  assert (select count(*) from information_schema.columns
           where table_schema = 'public' and table_name = 'rsvps'
             and column_name = 'payment_status') = 1, 'rsvps.payment_status missing';
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.proname in ('mark_rsvp_paid', 'release_rsvp_hold', 'mark_rsvp_refunded',
                               'release_expired_rsvp_holds')) = 4,
    'not all four payment functions exist';
  assert (select count(*) from pg_trigger
           where tgrelid = 'public.rsvps'::regclass
             and tgname in ('send_rsvp_confirmation', 'send_rsvp_confirmation_on_payment')) = 2,
    'both confirmation triggers are not in place';
  assert (select count(*) from information_schema.columns
           where table_schema = 'public' and table_name = 'rsvps'
             and column_name = 'marked_paid_by') = 0,
    'marked_paid_by survived -- it only ever recorded a manual payment';
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'create_rsvp' and p.pronargs = 8) = 1,
    'create_rsvp is not the single 8-argument version';
  raise notice '15. schema assertions match 98_verify OK';
end $$;

-- Leave the database as the tests found it, so `supabase db reset` is not
-- needed between runs and the seeded events are untouched.
delete from public.rsvps where email in ('ada@example.com', 'grace@example.com',
  'katherine@example.com', 'mary@example.com', 'dorothy@example.com');
delete from public.events where title in ('TEST prepaid workshop', 'TEST door fee dinner');

\echo 'ALL TICKET TESTS PASSED'
