-- PAWTX — volunteer sign-ups that do not need an account.
--
-- The volunteer portal already registers people for shifts, and everything it
-- produces depends on there being an account behind the signup: service_log
-- credits hours to a profile id, document_signatures proves which text that
-- person agreed to, and a certificate is built from both. That chain is the
-- reason the portal asks for an account and six signed documents before a
-- volunteer can claim anything.
--
-- A one-off event is the case that chain is too heavy for. Somebody who hears
-- about a parade on Friday and wants to help carry tables on Saturday is not
-- going to create an account and read a release first, and the organisation
-- would rather know their name and phone number than have them turn up
-- unrecorded. So this table is the low-barrier path: a name, an email, a
-- phone, against a shift that already exists.
--
-- What it deliberately does NOT do is produce hours. There is no user_id here
-- and no path from this table into service_log, because service_log.user_id is
-- `not null references profiles` and a certificate the organisation signs must
-- not rest on a row anybody could have typed. A volunteer who wants credited
-- hours still goes through the portal. 98_verify.sql and EventVolunteersAdmin
-- both say so where staff will read it.
--
-- Every statement is safe to run twice: this file gets pasted into the SQL
-- editor by hand as well as applied by `supabase db push`, and there a run
-- that fails part way through must not leave a database this file can never be
-- applied to again.

-- ---------------------------------------------------------------------------
-- event_volunteers — one row per person per shift, no account required.
-- ---------------------------------------------------------------------------

create table if not exists public.event_volunteers (
  id         uuid primary key default gen_random_uuid(),
  -- The shift carries the event, the role, the time window and the capacity,
  -- so none of it is duplicated here. `on delete cascade` matches
  -- shift_signups: these rows are a roster, not a ledger, and a deleted shift
  -- has no roster. service_log goes the other way, `on delete set null`,
  -- because credited hours outlive the schedule entry that produced them.
  shift_id   uuid not null references public.shifts (id) on delete cascade,
  full_name  text not null check (length(btrim(full_name)) between 2 and 120),
  -- Checked here as well as in the function below, because the constraint is
  -- what holds if anything ever reaches the table another way.
  email      text not null check (position('@' in email) > 1 and length(email) <= 200),
  phone      text check (length(btrim(phone)) between 7 and 40),
  -- Free text from the signup form: "can only stay until 2", "bringing my
  -- son". Short on purpose — a note to the shift lead, not a record.
  note       text check (length(note) <= 500),
  -- Mirrors shift_signups.attendance, including null meaning "the roster has
  -- not been looked at yet". No hours follow from it; it is what staff
  -- observed, and nothing more.
  attendance text check (attendance in ('attended', 'no_show')),
  -- Which side of the bilingual site they signed up from, so a later reminder
  -- can be written in it. Same reasoning as rsvps.language.
  language   text not null default 'en' check (language in ('en', 'es')),
  created_at timestamptz not null default now()
);

comment on table public.event_volunteers is
  'Volunteer sign-ups for a shift that do not require an account. Carries no user_id and feeds no hours: service_log and certificates are reachable only through the portal. Inserts go exclusively through signup_event_volunteer().';

comment on column public.event_volunteers.attendance is
  'What staff observed on the day. Unlike shift_signups.attendance this credits nothing — there is no profile to credit.';

-- One signup per address per shift. A functional index rather than a unique
-- constraint, because the address is stored as entered and compared folded:
-- the same person writing Ana@ on Friday and ana@ on Saturday is one signup,
-- and the function below turns the collision into a clean "already signed up"
-- rather than a 500.
create unique index if not exists event_volunteers_shift_email_idx
  on public.event_volunteers (shift_id, lower(email));

-- The admin screen reads a whole event at a time: every signup for every shift
-- of one event, newest first.
create index if not exists event_volunteers_shift_id_idx
  on public.event_volunteers (shift_id, created_at desc);

-- ---------------------------------------------------------------------------
-- The capacity counter, shared with shift_signups.
-- ---------------------------------------------------------------------------
--
-- A signup here occupies a real place on the shift, so it has to count against
-- the same shifts.spots_filled the portal maintains — otherwise an account
-- holder and a walk-in volunteer are each told the last place is free.
--
-- sync_shift_spots_filled() is reused rather than copied: it reads nothing but
-- NEW.shift_id / OLD.shift_id, which this table spells the same way, and the
-- semantics are identical. One function means the counter cannot come to be
-- maintained two subtly different ways.
drop trigger if exists event_volunteers_sync_count on public.event_volunteers;
create trigger event_volunteers_sync_count
  after insert or delete on public.event_volunteers
  for each row execute function public.sync_shift_spots_filled();

-- ---------------------------------------------------------------------------
-- RLS — personal data, so no anon policy of any kind.
-- ---------------------------------------------------------------------------
--
-- The site is a static bundle and the anon key ships to every visitor, so a
-- select policy for anon here would publish the name, email and phone number
-- of everyone who volunteered. There is none, and 98_verify.sql asserts it.
-- Anonymous visitors still need to write, which is what the SECURITY DEFINER
-- function below is for: it runs as its owner, so it needs no policy at all.

alter table public.event_volunteers enable row level security;

drop policy if exists "event_volunteers: admins read" on public.event_volunteers;
create policy "event_volunteers: admins read"
  on public.event_volunteers for select
  to authenticated
  using (public.is_admin());

drop policy if exists "event_volunteers: admins write" on public.event_volunteers;
create policy "event_volunteers: admins write"
  on public.event_volunteers for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Inserts go through signup_event_volunteer() alone, so the capacity check and
-- the row are one transaction. Unlike rsvps, DELETE is left available to the
-- admin policy above: the trigger gives the place back in the same statement,
-- so a cancellation cannot leave the count overstated.
revoke insert on public.event_volunteers from anon, authenticated;

-- Marking attendance is the only edit staff make. Revoking the table-wide
-- UPDATE and granting one column back is the same mechanism that stops a user
-- setting their own profiles.role: a roster entry records what somebody wrote
-- when they signed up, and an admin should not be able to rewrite the name or
-- the phone number afterwards.
revoke update on public.event_volunteers from anon, authenticated;
grant update (attendance) on public.event_volunteers to authenticated;

-- ---------------------------------------------------------------------------
-- signup_event_volunteer — the only way in.
-- ---------------------------------------------------------------------------
--
-- Mirrors create_rsvp: lock the row that holds the capacity, check it, write,
-- and let the trigger move the counter. The lock is what makes the check mean
-- anything — two people submitting the last place at the same moment cannot
-- both read spots_filled before the other insert lands.

create or replace function public.signup_event_volunteer(
  p_shift_id  uuid,
  p_full_name text,
  p_email     text,
  p_phone     text default null,
  p_note      text default null,
  p_language  text default 'en'
)
returns public.event_volunteers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.shifts;
  v_row   public.event_volunteers;
begin
  -- Validated before the lock is taken: a blank name should not make anybody
  -- else wait, and these two are the fields the form can get wrong.
  if p_full_name is null or length(btrim(p_full_name)) < 2 then
    raise exception 'invalid_volunteer_name' using errcode = 'PA010';
  end if;

  if p_email is null or position('@' in btrim(p_email)) < 2
     or length(btrim(p_email)) > 200 then
    raise exception 'invalid_volunteer_email' using errcode = 'PA011';
  end if;

  -- Locks the shift for the rest of the transaction; a concurrent signup for
  -- the same shift blocks here and re-reads the updated count. Taken before
  -- the insert, so the trigger's own UPDATE of this row is already ours.
  select * into v_shift
    from public.shifts
   where id = p_shift_id and published
   for update;

  if not found then
    raise exception 'shift_not_found' using errcode = 'PA012';
  end if;

  -- A shift still running stays open: somebody arriving an hour into a
  -- four-hour setup is exactly who this path is for. Only one that has
  -- finished is closed.
  if v_shift.ends_at <= now() then
    raise exception 'shift_over' using errcode = 'PA013';
  end if;

  -- Asked before capacity, and that order is the point: somebody who already
  -- signed up has filled a place themselves, so a full shift would otherwise
  -- tell the last volunteer to take it that there is no room — on the shift
  -- they are already on. event_volunteers_shift_email_idx is still what makes
  -- this safe against two identical submissions at once; this check is what
  -- makes the answer true.
  if exists (
    select 1 from public.event_volunteers
     where shift_id = p_shift_id
       and lower(email) = lower(btrim(p_email))
  ) then
    raise exception 'already_signed_up' using errcode = 'PA015';
  end if;

  if v_shift.spots_filled >= v_shift.spots_total then
    raise exception 'shift_full' using errcode = 'PA014';
  end if;

  begin
    insert into public.event_volunteers (shift_id, full_name, email, phone, note, language)
    values (
      p_shift_id,
      btrim(p_full_name),
      lower(btrim(p_email)),
      nullif(btrim(coalesce(p_phone, '')), ''),
      nullif(btrim(coalesce(p_note, '')), ''),
      case when p_language = 'es' then 'es' else 'en' end
    )
    returning * into v_row;
  exception when unique_violation then
    raise exception 'already_signed_up' using errcode = 'PA015';
  end;

  return v_row;
end;
$$;

comment on function public.signup_event_volunteer(uuid, text, text, text, text, text) is
  'Signs a volunteer up for one shift without an account. Holds a FOR UPDATE lock on the shift while checking capacity; the event_volunteers_sync_count trigger moves shifts.spots_filled. Raises PA010-PA015 (see src/lib/api/errors.ts).';

-- Anonymous visitors must be able to sign up; that is the whole point of this
-- path. The function validates its own input and touches nothing else, which
-- is what makes it safe to expose where a table grant would not be.
grant execute on function public.signup_event_volunteer(uuid, text, text, text, text, text)
  to anon, authenticated;
