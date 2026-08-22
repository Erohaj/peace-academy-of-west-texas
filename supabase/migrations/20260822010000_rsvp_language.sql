-- Remember which language someone booked in, so the confirmation is in it.
--
-- The site is bilingual, but an RSVP recorded nothing about which side of it
-- the visitor was reading. send-rsvp-confirmation therefore had no way to
-- choose, and wrote every confirmation in English -- it even selects title_es
-- from the event and then has nothing to do with it. A Spanish speaker filled
-- in a Spanish form and got an English email back.
--
-- The webhook fires on INSERT and sees only the new row, so the answer has to
-- live on the row. Direct inserts are revoked, which leaves create_rsvp as the
-- only way to set it.
--
-- Defaults to 'en' rather than being nullable: rows written before this column
-- existed did get an English email, so 'en' is the truth about them, not a
-- guess standing in for one.

alter table public.rsvps
  add column if not exists language text not null default 'en';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.rsvps'::regclass
       and conname = 'rsvps_language_check'
  ) then
    alter table public.rsvps
      add constraint rsvps_language_check
      check (language in ('en', 'es'));
  end if;
end $$;

comment on column public.rsvps.language is
  'Which language the site was in when this RSVP was made. Drives the language of the confirmation email; matches the i18n codes the front end uses.';

-- ---------------------------------------------------------------------------
-- create_rsvp gains the language.
--
-- Dropped and recreated rather than replaced: the argument list changes, and
-- leaving the 7-argument version in place would make the call ambiguous —
-- PostgREST resolves overloads by argument name, so both would be reachable
-- and a client that omitted p_language could silently land on the old one.
--
-- Everything else is carried over verbatim, including the PA006 guard against
-- booking an event that has already finished.
-- ---------------------------------------------------------------------------

drop function if exists public.create_rsvp(uuid, text, text, text, integer, numeric, text);

create function public.create_rsvp(
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
  v_event public.events;
  v_seats integer;
  v_rsvp  public.rsvps;
  v_consent text;
  v_language text;
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

  if v_event.reserved_spots + v_seats > v_event.total_spots then
    raise exception 'event_full' using errcode = 'PA001';
  end if;

  begin
    insert into public.rsvps (
      event_id, full_name, email, phone, guest_count, optional_donation, media_consent, language
    )
    values (
      p_event_id,
      btrim(p_full_name),
      lower(btrim(p_email)),
      nullif(btrim(coalesce(p_phone, '')), ''),
      p_guest_count,
      coalesce(p_optional_donation, 0),
      v_consent,
      v_language
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
grant execute on function public.create_rsvp(uuid, text, text, text, integer, numeric, text, text)
  to anon, authenticated;
