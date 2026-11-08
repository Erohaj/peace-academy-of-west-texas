-- Exercises the no-account volunteer signup against a real Postgres.
--
-- Every check is an ASSERT: the script either runs to "ALL EVENT VOLUNTEER
-- TESTS PASSED" or stops on the first thing that is not true. Run with
--   psql -v ON_ERROR_STOP=1 -f event_volunteers.sql
-- so a failure is an exit code and not a line somebody has to spot in the log.
--
-- It exists for the same reason the ticket tests do: `tsc` cannot tell you
-- whether a place on a shift comes back, and this is the one table two
-- different signup paths write a shared counter from. The portal decrements
-- shifts.spots_filled through shift_signups; this form does it through
-- event_volunteers; and if the two ever stop agreeing, the failure is a
-- volunteer told a shift is full when it is not, or six people turning up to
-- four places.

\set ON_ERROR_STOP on
\timing off

-- Anything a previous run left behind, so this file can be re-run without a
-- full `supabase db reset` between attempts. Order matters: the signups and
-- roster rows go before the shifts they point at, or the cascade fires the
-- counter triggers against rows this script is about to assert on.
delete from public.event_volunteers
 where shift_id in (select id from public.shifts where title like 'TEST volunteer%');
delete from public.shift_signups
 where shift_id in (select id from public.shifts where title like 'TEST volunteer%');
delete from public.service_log
 where shift_id in (select id from public.shifts where title like 'TEST volunteer%');
delete from public.shifts where title like 'TEST volunteer%';
delete from public.events where title = 'TEST volunteer event';
delete from public.profiles where email = 'portal@volunteer.test';
delete from auth.users where email = 'portal@volunteer.test';

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into public.events (
  id, title, title_es, description, description_es,
  starts_at, ends_at, location, category, total_spots
) values (
  'aaaaaaaa-0000-4000-8000-0000000000f1',
  'TEST volunteer event', 'x', 'x', 'x',
  now() + interval '10 days', now() + interval '10 days' + interval '4 hours',
  'Odessa', 'cultural', 100
);

insert into public.shifts (
  id, event_id, title, title_es, description, description_es,
  role, role_es, starts_at, ends_at, spots_total, published
) values
-- Two places, so capacity can be reached rather than merely approached.
(
  'bbbbbbbb-0000-4000-8000-0000000000f1',
  'aaaaaaaa-0000-4000-8000-0000000000f1',
  'TEST volunteer shift open', 'x', 'x', 'x',
  'Greeter', 'Recepción',
  now() + interval '10 days', now() + interval '10 days' + interval '4 hours', 2, true
),
-- Finished yesterday.
(
  'bbbbbbbb-0000-4000-8000-0000000000f2',
  'aaaaaaaa-0000-4000-8000-0000000000f1',
  'TEST volunteer shift over', 'x', 'x', 'x',
  'Food Prep', 'Cocina',
  now() - interval '2 days', now() - interval '1 day', 5, true
),
-- A draft: the function filters on `published`, so this must be unreachable.
(
  'bbbbbbbb-0000-4000-8000-0000000000f3',
  'aaaaaaaa-0000-4000-8000-0000000000f1',
  'TEST volunteer shift draft', 'x', 'x', 'x',
  'Greeter', 'Recepción',
  now() + interval '10 days', now() + interval '10 days' + interval '4 hours', 5, false
),
-- One place, contested by both signup paths.
(
  'bbbbbbbb-0000-4000-8000-0000000000f4',
  'aaaaaaaa-0000-4000-8000-0000000000f1',
  'TEST volunteer shift shared', 'x', 'x', 'x',
  'Distribution', 'Distribución',
  now() + interval '10 days', now() + interval '10 days' + interval '4 hours', 1, true
),
-- Still running: started an hour ago, ends in three. Must stay open.
(
  'bbbbbbbb-0000-4000-8000-0000000000f5',
  'aaaaaaaa-0000-4000-8000-0000000000f1',
  'TEST volunteer shift running', 'x', 'x', 'x',
  'General Support', 'Apoyo General',
  now() - interval '1 hour', now() + interval '3 hours', 5, true
);

-- ===========================================================================
-- 1. Grants and RLS: a visitor may sign up, and may read nothing
-- ===========================================================================
do $$
begin
  assert has_function_privilege(
    'anon', 'public.signup_event_volunteer(uuid,text,text,text,text,text)', 'execute'),
    'anon cannot call signup_event_volunteer -- nobody could sign up at all';
  assert has_function_privilege(
    'authenticated', 'public.signup_event_volunteer(uuid,text,text,text,text,text)', 'execute'),
    'authenticated cannot call signup_event_volunteer';

  -- The anon key ships to every visitor, so one select policy here would
  -- publish the name, email and phone of everyone who volunteered.
  assert (select count(*) from pg_policies
           where schemaname = 'public' and tablename = 'event_volunteers'
             and 'anon' = any(roles)) = 0,
    'event_volunteers has a policy for anon -- volunteer contact details are public';

  assert (select rowsecurity from pg_tables
           where schemaname = 'public' and tablename = 'event_volunteers'),
    'RLS is not enabled on event_volunteers';

  -- Both signup paths must reach the counter through the same function. This
  -- is the structural half of test 8 below: that one proves the two paths
  -- share the count, this one proves there is only one implementation to
  -- share.
  --
  -- Deliberately not asserting that anon lacks EXECUTE on
  -- sync_shift_spots_filled. The init migration revokes it from anon and
  -- authenticated but not from PUBLIC, and a new function is granted to
  -- PUBLIC by default -- so the privilege is still there, as it is for every
  -- trigger function in this schema. It is not reachable: Postgres refuses a
  -- direct call to a function returning `trigger`. Worth knowing, not worth
  -- asserting here, and not this migration's to change.
  assert (select count(distinct p.proname) from pg_trigger t
            join pg_proc p on p.oid = t.tgfoid
           where t.tgname in ('shift_signups_sync_count', 'event_volunteers_sync_count')
             and not t.tgisinternal) = 1,
    'the two signup paths do not share one counter function';
  assert (select count(*) from pg_trigger t
            join pg_proc p on p.oid = t.tgfoid
           where t.tgname in ('shift_signups_sync_count', 'event_volunteers_sync_count')
             and p.proname = 'sync_shift_spots_filled'
             and not t.tgisinternal) = 2,
    'one of the two counter triggers is missing or points somewhere else';

  -- One writable column: what staff observed. A roster entry records what
  -- somebody wrote when they signed up.
  assert (select count(*) from information_schema.column_privileges
           where table_schema = 'public' and table_name = 'event_volunteers'
             and privilege_type = 'UPDATE' and grantee = 'authenticated') = 1,
    'authenticated can update more than attendance on event_volunteers';
  assert (select count(*) from information_schema.column_privileges
           where table_schema = 'public' and table_name = 'event_volunteers'
             and privilege_type = 'UPDATE' and grantee = 'authenticated'
             and column_name = 'attendance') = 1,
    'the one writable column on event_volunteers is not attendance';

  raise notice '1. grants and RLS OK';
end $$;

-- ===========================================================================
-- 2. The happy path, and what the function does to what it is given
-- ===========================================================================
do $$
declare
  v_row public.event_volunteers;
begin
  v_row := public.signup_event_volunteer(
    'bbbbbbbb-0000-4000-8000-0000000000f1',
    '  Ada Lovelace  ',
    '  ADA@Volunteer.Test  ',
    '   ',
    '   ',
    'es'
  );

  assert v_row.full_name = 'Ada Lovelace',
    format('the name was not trimmed: %L', v_row.full_name);
  assert v_row.email = 'ada@volunteer.test',
    format('the address was not folded and trimmed: %L', v_row.email);
  -- Whitespace is not a phone number, and storing it as one would put an
  -- empty row in front of whoever is ringing round the day before.
  assert v_row.phone is null, format('blank phone stored as %L', v_row.phone);
  assert v_row.note is null, format('blank note stored as %L', v_row.note);
  assert v_row.language = 'es', 'the language was not kept';
  assert v_row.attendance is null,
    'a new signup is already marked -- null is what marks a roster unprocessed';

  -- The place is taken immediately, by the trigger, on the shift.
  assert (select spots_filled from public.shifts
           where id = 'bbbbbbbb-0000-4000-8000-0000000000f1') = 1,
    'spots_filled did not move -- the event_volunteers trigger is not firing';

  raise notice '2. happy path and normalisation OK';
end $$;

-- ===========================================================================
-- 3. One signup per address per shift, however it is spelled
-- ===========================================================================
do $$
declare
  v_caught boolean := false;
begin
  begin
    perform public.signup_event_volunteer(
      'bbbbbbbb-0000-4000-8000-0000000000f1', 'Ada Again', 'Ada@VOLUNTEER.test');
  exception when sqlstate 'PA015' then
    v_caught := true;
  end;

  assert v_caught,
    'the same address signed up twice for one shift -- the folded unique index is not holding';
  assert (select spots_filled from public.shifts
           where id = 'bbbbbbbb-0000-4000-8000-0000000000f1') = 1,
    'a rejected duplicate still spent a place';

  -- The same person on a different shift is a different signup, not a clash.
  perform public.signup_event_volunteer(
    'bbbbbbbb-0000-4000-8000-0000000000f5', 'Ada Lovelace', 'ada@volunteer.test');

  raise notice '3. duplicate handling OK';
end $$;

-- ===========================================================================
-- 3b. A duplicate on a FULL shift still reads as a duplicate
-- ===========================================================================
--
-- The capacity check used to come first, so somebody who reloaded the page and
-- submitted again was told the shift had filled up -- on the shift they were
-- already on, which they had filled themselves. One-place shift, because that
-- is the only size where one person can be the whole reason it is full.
do $$
declare
  v_code text;
begin
  perform public.signup_event_volunteer(
    'bbbbbbbb-0000-4000-8000-0000000000f4', 'Solo Volunteer', 'solo@volunteer.test');

  assert (select spots_filled from public.shifts
           where id = 'bbbbbbbb-0000-4000-8000-0000000000f4') = 1,
    'the one-place shift did not fill';

  begin
    perform public.signup_event_volunteer(
      'bbbbbbbb-0000-4000-8000-0000000000f4', 'Solo Volunteer', 'SOLO@volunteer.test');
  exception when others then
    v_code := sqlstate;
  end;

  assert v_code = 'PA015',
    format('resubmitting on a shift you filled yourself reported %L, not already_signed_up', v_code);

  -- Put it back for test 8, which needs this shift empty.
  delete from public.event_volunteers
   where shift_id = 'bbbbbbbb-0000-4000-8000-0000000000f4';

  assert (select spots_filled from public.shifts
           where id = 'bbbbbbbb-0000-4000-8000-0000000000f4') = 0,
    'the one-place shift did not empty again';

  raise notice '3b. duplicate on a full shift OK';
end $$;

-- ===========================================================================
-- 4. Capacity, checked under the shift's own lock
-- ===========================================================================
do $$
declare
  v_caught boolean := false;
begin
  -- Second of two places.
  perform public.signup_event_volunteer(
    'bbbbbbbb-0000-4000-8000-0000000000f1', 'Grace Hopper', 'grace@volunteer.test');

  assert (select spots_filled from public.shifts
           where id = 'bbbbbbbb-0000-4000-8000-0000000000f1') = 2,
    'the second signup did not fill the shift';

  begin
    perform public.signup_event_volunteer(
      'bbbbbbbb-0000-4000-8000-0000000000f1', 'Katherine Johnson', 'katherine@volunteer.test');
  exception when sqlstate 'PA014' then
    v_caught := true;
  end;

  assert v_caught, 'a third volunteer took a two-place shift';
  assert (select count(*) from public.event_volunteers
           where shift_id = 'bbbbbbbb-0000-4000-8000-0000000000f1') = 2,
    'the refused signup was written anyway';

  raise notice '4. capacity OK';
end $$;

-- ===========================================================================
-- 5. Which shifts are reachable at all
-- ===========================================================================
do $$
declare
  v_caught boolean := false;
begin
  -- Finished.
  begin
    perform public.signup_event_volunteer(
      'bbbbbbbb-0000-4000-8000-0000000000f2', 'Mary Jackson', 'mary@volunteer.test');
  exception when sqlstate 'PA013' then
    v_caught := true;
  end;
  assert v_caught, 'somebody signed up for a shift that already finished';

  -- Draft.
  v_caught := false;
  begin
    perform public.signup_event_volunteer(
      'bbbbbbbb-0000-4000-8000-0000000000f3', 'Dorothy Vaughan', 'dorothy@volunteer.test');
  exception when sqlstate 'PA012' then
    v_caught := true;
  end;
  assert v_caught, 'an unpublished shift was reachable from the public form';

  -- No such shift.
  v_caught := false;
  begin
    perform public.signup_event_volunteer(
      'bbbbbbbb-0000-4000-8000-00000000dead', 'Nobody', 'nobody@volunteer.test');
  exception when sqlstate 'PA012' then
    v_caught := true;
  end;
  assert v_caught, 'a signup against a missing shift did not raise PA012';

  -- Still running: started an hour ago. Somebody arriving late is exactly who
  -- this path is for, so this one must succeed.
  perform public.signup_event_volunteer(
    'bbbbbbbb-0000-4000-8000-0000000000f5', 'Late Arrival', 'late@volunteer.test');

  raise notice '5. shift eligibility OK';
end $$;

-- ===========================================================================
-- 6. Input the form should never send, rejected anyway
-- ===========================================================================
do $$
declare
  v_caught boolean := false;
begin
  begin
    perform public.signup_event_volunteer(
      'bbbbbbbb-0000-4000-8000-0000000000f5', '  ', 'blank@volunteer.test');
  exception when sqlstate 'PA010' then
    v_caught := true;
  end;
  assert v_caught, 'a blank name was accepted';

  v_caught := false;
  begin
    perform public.signup_event_volunteer(
      'bbbbbbbb-0000-4000-8000-0000000000f5', 'No Address', 'not-an-address');
  exception when sqlstate 'PA011' then
    v_caught := true;
  end;
  assert v_caught, 'an address with no @ was accepted';

  v_caught := false;
  begin
    perform public.signup_event_volunteer(
      'bbbbbbbb-0000-4000-8000-0000000000f5', 'No Address', null);
  exception when sqlstate 'PA011' then
    v_caught := true;
  end;
  assert v_caught, 'a null address was accepted';

  raise notice '6. input validation OK';
end $$;

-- ===========================================================================
-- 7. A cancellation gives the place back
-- ===========================================================================
do $$
begin
  assert (select spots_filled from public.shifts
           where id = 'bbbbbbbb-0000-4000-8000-0000000000f1') = 2,
    'the shift under test is not full before the cancellation';

  delete from public.event_volunteers
   where shift_id = 'bbbbbbbb-0000-4000-8000-0000000000f1'
     and email = 'grace@volunteer.test';

  -- This is what makes DELETE safe here where it is revoked on rsvps: the
  -- trigger moves the counter in the same statement.
  assert (select spots_filled from public.shifts
           where id = 'bbbbbbbb-0000-4000-8000-0000000000f1') = 1,
    'the cancelled place did not come back -- the delete branch of the trigger is not firing';

  -- And the freed place is genuinely available again.
  perform public.signup_event_volunteer(
    'bbbbbbbb-0000-4000-8000-0000000000f1', 'Katherine Johnson', 'katherine@volunteer.test');

  assert (select spots_filled from public.shifts
           where id = 'bbbbbbbb-0000-4000-8000-0000000000f1') = 2,
    'the shift did not refill';

  raise notice '7. cancellation OK';
end $$;

-- ===========================================================================
-- 8. One counter, two signup paths
-- ===========================================================================
--
-- The point of reusing sync_shift_spots_filled() rather than copying it. If
-- these two ever stop sharing the count, an account holder and a walk-in are
-- each told the same last place is free.
do $$
declare
  v_user_id uuid := 'cccccccc-0000-4000-8000-0000000000f1';
  v_caught  boolean := false;
begin
  -- The on_auth_user_created trigger makes the profile shift_signups needs.
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'portal@volunteer.test', now(), now());

  assert (select count(*) from public.profiles where id = v_user_id) = 1,
    'the profile trigger did not run -- this test cannot exercise the portal path';

  -- The portal path takes the single place on the shared shift.
  insert into public.shift_signups (shift_id, user_id)
  values ('bbbbbbbb-0000-4000-8000-0000000000f4', v_user_id);

  assert (select spots_filled from public.shifts
           where id = 'bbbbbbbb-0000-4000-8000-0000000000f4') = 1,
    'the portal signup did not fill the shared shift';

  -- So the public form must be refused it.
  begin
    perform public.signup_event_volunteer(
      'bbbbbbbb-0000-4000-8000-0000000000f4', 'Walk In', 'walkin@volunteer.test');
  exception when sqlstate 'PA014' then
    v_caught := true;
  end;

  assert v_caught,
    'the form took a place the portal had already taken -- the two paths are not sharing the counter';

  -- And the reverse: releasing the portal signup frees it for the form.
  delete from public.shift_signups
   where shift_id = 'bbbbbbbb-0000-4000-8000-0000000000f4' and user_id = v_user_id;

  assert (select spots_filled from public.shifts
           where id = 'bbbbbbbb-0000-4000-8000-0000000000f4') = 0,
    'releasing the portal signup did not free the place';

  perform public.signup_event_volunteer(
    'bbbbbbbb-0000-4000-8000-0000000000f4', 'Walk In', 'walkin@volunteer.test');

  assert (select spots_filled from public.shifts
           where id = 'bbbbbbbb-0000-4000-8000-0000000000f4') = 1,
    'the form could not take the freed place';

  -- Now the other way round: the portal must be refused a place the form holds.
  v_caught := false;
  begin
    insert into public.shift_signups (shift_id, user_id)
    values ('bbbbbbbb-0000-4000-8000-0000000000f4', v_user_id);
  exception when check_violation then
    -- shifts_not_overbooked, tripped inside the trigger's UPDATE.
    v_caught := true;
  end;

  assert v_caught,
    'the portal took a place the form was holding -- shifts_not_overbooked is not covering it';

  raise notice '8. shared counter OK';
end $$;

-- ===========================================================================
-- 9. Attendance records observation, and only the two values
-- ===========================================================================
do $$
declare
  v_caught boolean := false;
  v_id     uuid;
begin
  select id into v_id from public.event_volunteers
   where email = 'ada@volunteer.test'
     and shift_id = 'bbbbbbbb-0000-4000-8000-0000000000f1';

  update public.event_volunteers set attendance = 'attended' where id = v_id;
  assert (select attendance from public.event_volunteers where id = v_id) = 'attended',
    'attendance did not save';

  -- Back to null: a correction has to be able to undo a mis-click, which is
  -- also why null has to stay a legal value after the fact.
  update public.event_volunteers set attendance = null where id = v_id;
  assert (select attendance from public.event_volunteers where id = v_id) is null,
    'attendance could not be cleared';

  begin
    update public.event_volunteers set attendance = 'maybe' where id = v_id;
  exception when check_violation then
    v_caught := true;
  end;
  assert v_caught, 'an attendance value outside the two allowed was accepted';

  -- Marking attendance credits nothing. There is no profile to credit, and a
  -- service letter must never be built from a row anybody could have typed.
  assert (select count(*) from public.service_log
           where shift_id = 'bbbbbbbb-0000-4000-8000-0000000000f1') = 0,
    'a no-account signup produced a service_log row';

  raise notice '9. attendance OK';
end $$;

-- ===========================================================================
-- 10. Deleting a shift takes its roster with it
-- ===========================================================================
do $$
begin
  delete from public.shifts where id = 'bbbbbbbb-0000-4000-8000-0000000000f5';

  assert (select count(*) from public.event_volunteers
           where shift_id = 'bbbbbbbb-0000-4000-8000-0000000000f5') = 0,
    'signups outlived the shift they were for';

  raise notice '10. cascade OK';
end $$;

-- ---------------------------------------------------------------------------
-- Tidy up, so the next run starts where this one did.
-- ---------------------------------------------------------------------------
delete from public.event_volunteers
 where shift_id in (select id from public.shifts where title like 'TEST volunteer%');
delete from public.shift_signups
 where shift_id in (select id from public.shifts where title like 'TEST volunteer%');
delete from public.shifts where title like 'TEST volunteer%';
delete from public.events where title = 'TEST volunteer event';
delete from auth.users where email = 'portal@volunteer.test';

do $$
begin
  raise notice 'ALL EVENT VOLUNTEER TESTS PASSED';
end $$;
