-- Ask event attendees for photo/video consent at RSVP time, per event.
--
-- Volunteers already answer this when they sign 04-media-consent.md during
-- onboarding (document_signatures.choice). Attendees never signed anything,
-- so photographing a community dinner and posting it left the org with no
-- record of who had objected. This puts the same three-way question on the
-- RSVP form — but only for the events an admin turns it on for, since a
-- relief-drive signup does not need it.
--
-- The vocabulary deliberately matches document_signatures.choice
-- ('yes' | 'photos_only' | 'no') so the two sources can be read together
-- without translating between them.

alter table public.events
  add column if not exists collect_media_consent boolean not null default false;

comment on column public.events.collect_media_consent is
  'When true, create_rsvp() requires a media_consent answer. Off by default: turning it on is an explicit editorial decision per event.';

-- UPDATE on events is granted column by column (the table-wide grant is revoked
-- so that reserved_spots stays out of an admin's reach). A new column is not
-- covered by that earlier list, so without this the admin panel could create an
-- event with the toggle on but never change it afterwards.
grant update (collect_media_consent) on public.events to authenticated;

alter table public.rsvps
  add column if not exists media_consent text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.rsvps'::regclass
       and conname = 'rsvps_media_consent_check'
  ) then
    alter table public.rsvps
      add constraint rsvps_media_consent_check
      check (media_consent is null or media_consent in ('yes', 'photos_only', 'no'));
  end if;
end $$;

comment on column public.rsvps.media_consent is
  'Photo/video permission given at RSVP. Null means the question was never asked (the event had collect_media_consent off, or the row predates this column) — which is not the same as a "no" and must not be read as consent either.';

-- ---------------------------------------------------------------------------
-- create_rsvp gains the answer.
--
-- Dropped and recreated rather than overloaded: leaving the 6-argument version
-- in place would make an unqualified call ambiguous, and PostgREST resolves by
-- argument name, so both would be reachable.
-- ---------------------------------------------------------------------------

drop function if exists public.create_rsvp(uuid, text, text, text, integer, numeric);

create function public.create_rsvp(
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

-- Anonymous visitors must be able to RSVP; that is the whole point.
grant execute on function public.create_rsvp(uuid, text, text, text, integer, numeric, text)
  to anon, authenticated;
