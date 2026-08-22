-- Stop create_rsvp() accepting bookings for events that have already happened.
--
-- The function checked the guest count, the event's existence, media consent
-- and the seat count, but never the clock. Nothing on the public side made up
-- for that either: fetchEvents() filtered on `published` alone, so an event
-- that finished last week stayed in "Upcoming Community Events" with a live
-- RSVP button and a "spots left" badge, and the booking it produced was
-- accepted -- consuming a seat on a dinner nobody was going to attend.
--
-- "Over" is `coalesce(ends_at, starts_at) <= now()`. ends_at is nullable, and
-- an event that is currently running should stay bookable: someone reading the
-- page at 6pm can still decide to come to the 5:30 class. That is the same
-- rule the volunteer side already applies to shifts.
--
-- Checked after event_not_found and before everything else: "this already
-- happened" is the answer the visitor needs, and telling them the event is
-- full instead would send them off to ask about a waitlist for it.
--
-- Replaced with CREATE OR REPLACE rather than dropped and recreated: the
-- argument list is unchanged, so the existing grant to anon/authenticated
-- carries over. A DROP would take the grant with it.

create or replace function public.create_rsvp(
  p_event_id          uuid,
  p_full_name         text,
  p_email             text,
  p_phone             text default null,
  p_guest_count       integer default 0,
  p_optional_donation numeric default 0,
  p_media_consent     text default null
)
returns public.rsvps
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_seats integer;
  v_rsvp  public.rsvps;
  v_consent text;
begin
  if p_guest_count is null or p_guest_count < 0 or p_guest_count > 10 then
    raise exception 'invalid_guest_count' using errcode = 'PA004';
  end if;

  v_consent := nullif(btrim(coalesce(p_media_consent, '')), '');

  if v_consent is not null and v_consent not in ('yes', 'photos_only', 'no') then
    raise exception 'invalid_media_consent' using errcode = 'PA005';
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

  if v_event.reserved_spots + v_seats > v_event.total_spots then
    raise exception 'event_full' using errcode = 'PA001';
  end if;

  begin
    insert into public.rsvps (event_id, full_name, email, phone, guest_count, optional_donation, media_consent)
    values (
      p_event_id,
      btrim(p_full_name),
      lower(btrim(p_email)),
      nullif(btrim(coalesce(p_phone, '')), ''),
      p_guest_count,
      coalesce(p_optional_donation, 0),
      v_consent
    )
    returning * into v_rsvp;
  exception when unique_violation then
    raise exception 'already_registered' using errcode = 'PA002';
  end;

  update public.events
     set reserved_spots = reserved_spots + v_seats
   where id = p_event_id;

  return v_rsvp;
end;
$$;
