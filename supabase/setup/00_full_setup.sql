-- PAWTX — полная установка базы одним файлом.
--
-- Собран скриптом scripts/generate-setup-bundle.mjs из supabase/migrations/*.sql
-- и supabase/seed.sql. РУКАМИ НЕ ПРАВИТЬ: добавили миграцию — выполните
-- `npm run setup:bundle`, иначе этот файл и migrations/ разъедутся, а тот, кто
-- ставит базу из дашборда, получит схему, под которую сайт уже не написан.
--
-- Скопируйте ВЕСЬ файл и выполните в Supabase → SQL Editor → New query → Run.
--
-- Рассчитан на ПУСТОЙ проект и один запуск: create table и create policy здесь
-- без `if not exists`, поэтому повторный прогон упадёт на «already exists». Если
-- установка прервалась на середине — выполните 99_reset.sql и начните заново.
-- После установки проверьте себя файлом 98_verify.sql.

-- ============================================================
-- ФАЙЛ: supabase/migrations/20260726120000_init_schema.sql
-- ============================================================

-- PAWTX backend — core schema.
--
-- Design notes that apply throughout:
--
--  * Text + CHECK constraints are used instead of Postgres enums so the values
--    stay in lockstep with the TypeScript union types in src/types/index.ts
--    without needing an ALTER TYPE migration every time a category is added.
--
--  * Images have TWO sources. Photos bundled into the app (src/assets/*.webp)
--    get content-hashed filenames at build time, so the database cannot store
--    their URLs — it stores `image_key`, which the client resolves against the
--    IMAGES registry in src/data/mockData.ts. Admin-uploaded photos live in
--    Supabase Storage and store an absolute `image_url`. The client prefers
--    image_url and falls back to image_key.
--
--  * Timestamps are real timestamptz values, not the human strings the seed
--    data used to carry ("Saturday, August 15, 2026"). Display labels are
--    formatted per-language on the client via src/lib/formatEventDate.ts.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- profiles — one row per auth.users row, created automatically on signup.
-- ---------------------------------------------------------------------------

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  phone       text,
  avatar_url  text,
  role        text not null default 'volunteer' check (role in ('volunteer', 'admin')),
  badges      text[] not null default '{}',
  joined_at   timestamptz not null default now()
);

comment on column public.profiles.role is
  'Authorization boundary for the admin panel. Only ever set manually via the Supabase dashboard or by another admin — never self-assigned from the client.';

-- Mirror new auth users into profiles. SECURITY DEFINER because the inserting
-- role during signup has no rights on public.profiles.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role check used by RLS policies across every table. SECURITY DEFINER is
-- essential here: a policy on `profiles` that queried `profiles` directly
-- would recurse infinitely. Running as the definer bypasses RLS on the lookup.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------

create table public.events (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  title_es       text not null,
  description    text not null,
  description_es text not null,
  starts_at      timestamptz not null,
  ends_at        timestamptz,
  location       text not null,
  category       text not null check (category in ('cooking', 'cultural', 'seminars', 'relief')),
  total_spots    integer not null check (total_spots >= 0),
  reserved_spots integer not null default 0 check (reserved_spots >= 0),
  image_key      text,
  image_url      text,
  status         text not null default 'upcoming' check (status in ('upcoming', 'ongoing', 'past')),
  featured       boolean not null default false,
  published      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint events_not_overbooked check (reserved_spots <= total_spots),
  constraint events_ends_after_start check (ends_at is null or ends_at > starts_at)
);

comment on column public.events.reserved_spots is
  'Seats already claimed, including any taken offline (by phone or in person). Seeded with a non-zero baseline and thereafter only ever changed inside create_rsvp(), which holds a row lock — never incremented from the client.';

create index events_published_starts_at_idx
  on public.events (starts_at)
  where published;

-- ---------------------------------------------------------------------------
-- rsvps
-- ---------------------------------------------------------------------------

create table public.rsvps (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references public.events (id) on delete cascade,
  full_name         text not null check (length(btrim(full_name)) between 1 and 120),
  email             text not null check (position('@' in email) > 1 and length(email) <= 254),
  phone             text check (length(phone) <= 40),
  guest_count       integer not null default 0 check (guest_count between 0 and 10),
  optional_donation numeric(10, 2) not null default 0 check (optional_donation >= 0),
  created_at        timestamptz not null default now()
);

-- Guards against a double-submitted form and against one person quietly
-- consuming an event's whole allocation.
create unique index rsvps_unique_email_per_event_idx
  on public.rsvps (event_id, lower(email));

create index rsvps_event_id_idx on public.rsvps (event_id);

-- ---------------------------------------------------------------------------
-- gallery_items
-- ---------------------------------------------------------------------------

create table public.gallery_items (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  title_es    text not null,
  caption     text not null,
  caption_es  text not null,
  category    text not null check (category in ('cooking', 'cultural', 'seminars', 'relief')),
  image_key   text,
  image_url   text,
  -- Month precision is all the UI shows ("October 2025"); the day is stored as
  -- the 1st so admins can pick a plain date in the form.
  taken_on    date not null,
  location    text not null,
  published   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index gallery_items_published_idx
  on public.gallery_items (sort_order, taken_on desc)
  where published;

-- ---------------------------------------------------------------------------
-- shifts + shift_signups
-- ---------------------------------------------------------------------------

create table public.shifts (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid references public.events (id) on delete set null,
  title          text not null,
  title_es       text not null,
  description    text not null,
  description_es text not null,
  role           text not null check (role in ('Food Prep', 'Event Setup', 'Greeter', 'Translator', 'Distribution', 'General Support')),
  role_es        text not null,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  -- Derived so the displayed duration can never drift from the actual window.
  duration_hours numeric(4, 2) generated always as (
    round((extract(epoch from (ends_at - starts_at)) / 3600.0)::numeric, 2)
  ) stored,
  spots_total    integer not null check (spots_total > 0),
  spots_filled   integer not null default 0 check (spots_filled >= 0),
  published      boolean not null default true,
  created_at     timestamptz not null default now(),

  constraint shifts_ends_after_start check (ends_at > starts_at),
  constraint shifts_not_overbooked check (spots_filled <= spots_total)
);

comment on column public.shifts.spots_filled is
  'Like events.reserved_spots: seeded with an offline baseline, then maintained exclusively by the shift_signups trigger below.';

create table public.shift_signups (
  id         uuid primary key default gen_random_uuid(),
  shift_id   uuid not null references public.shifts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),

  unique (shift_id, user_id)
);

create index shift_signups_user_id_idx on public.shift_signups (user_id);

-- Keeps shifts.spots_filled in step with signups. The shifts_not_overbooked
-- CHECK then rejects the insert when a shift is full, so the capacity rule is
-- enforced by the database rather than by hopeful client-side arithmetic.
create function public.sync_shift_spots_filled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.shifts
       set spots_filled = spots_filled + 1
     where id = new.shift_id;
    return new;
  else
    update public.shifts
       set spots_filled = greatest(0, spots_filled - 1)
     where id = old.shift_id;
    return old;
  end if;
end;
$$;

create trigger shift_signups_sync_count
  after insert or delete on public.shift_signups
  for each row execute function public.sync_shift_spots_filled();

-- ---------------------------------------------------------------------------
-- donations — written only by the Stripe webhook (service role).
-- ---------------------------------------------------------------------------

create table public.donations (
  id                    uuid primary key default gen_random_uuid(),
  stripe_session_id     text unique,
  stripe_payment_intent text,
  stripe_subscription   text,
  -- Integer cents, never a float: 0.1 + 0.2 has no place in accounting.
  amount_cents          integer not null check (amount_cents > 0),
  currency              text not null default 'usd',
  frequency             text not null check (frequency in ('one_time', 'monthly')),
  donor_name            text,
  donor_email           text,
  status                text not null default 'pending'
                          check (status in ('pending', 'paid', 'failed', 'refunded')),
  receipt_sent_at       timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index donations_status_created_at_idx on public.donations (status, created_at desc);

-- ---------------------------------------------------------------------------
-- contact_messages — written only by the send-contact-message function.
-- ---------------------------------------------------------------------------

create table public.contact_messages (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null check (length(btrim(full_name)) between 1 and 120),
  email        text not null check (position('@' in email) > 1 and length(email) <= 254),
  message      text not null check (length(btrim(message)) between 1 and 5000),
  source_ip    inet,
  handled      boolean not null default false,
  created_at   timestamptz not null default now()
);

create index contact_messages_created_at_idx on public.contact_messages (created_at desc);

-- Rate-limit lookup for the contact endpoint: "how many messages from this IP
-- in the last hour". Partial on recent rows only so it stays small.
create index contact_messages_ip_recent_idx on public.contact_messages (source_ip, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger events_touch_updated_at
  before update on public.events
  for each row execute function public.touch_updated_at();

create trigger donations_touch_updated_at
  before update on public.donations
  for each row execute function public.touch_updated_at();

-- ============================================================
-- ФАЙЛ: supabase/migrations/20260726120100_rls_and_rpc.sql
-- ============================================================

-- PAWTX backend — row level security and the RSVP booking function.
--
-- The site is a static bundle served from GitHub Pages, so the anon key ships
-- to every visitor and the browser talks to PostgREST directly. That makes RLS
-- the ONLY security boundary: anything not explicitly denied here is public.
-- Hiding a control in the UI protects nothing.

alter table public.profiles         enable row level security;
alter table public.events           enable row level security;
alter table public.rsvps            enable row level security;
alter table public.gallery_items    enable row level security;
alter table public.shifts           enable row level security;
alter table public.shift_signups    enable row level security;
alter table public.donations        enable row level security;
alter table public.contact_messages enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create policy "profiles: read own"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "profiles: admins read all"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

create policy "profiles: update own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles: admins manage all"
  on public.profiles for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- A row-level policy cannot restrict which COLUMNS a user may edit, so the
-- "update own" policy above would otherwise let anyone set role='admin' on
-- themselves. Column privileges are what actually close that hole.
--
-- The table-level UPDATE must be revoked first: in PostgreSQL a column-level
-- REVOKE does not subtract from a table-wide grant, so `REVOKE UPDATE (role)`
-- on its own would silently do nothing and leave the escalation open. Supabase
-- grants ALL on new public tables to `authenticated` by default, so that
-- table-wide grant is definitely present.
--
-- This applies to admins too, since they are also `authenticated`: promoting a
-- staff member is done once from the SQL editor
-- (`update public.profiles set role = 'admin' where email = '...'`), never from
-- the app. For an organisation this size that is the right trade — no UI can be
-- tricked into escalating anyone.
revoke update on public.profiles from authenticated;
grant update (full_name, phone, avatar_url) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Public content: events, gallery, shifts.
-- Readable by everyone when published; writable only by admins.
-- ---------------------------------------------------------------------------

create policy "events: read published"
  on public.events for select
  to anon, authenticated
  using (published or public.is_admin());

create policy "events: admins write"
  on public.events for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "gallery: read published"
  on public.gallery_items for select
  to anon, authenticated
  using (published or public.is_admin());

create policy "gallery: admins write"
  on public.gallery_items for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "shifts: read published"
  on public.shifts for select
  to anon, authenticated
  using (published or public.is_admin());

create policy "shifts: admins write"
  on public.shifts for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- events.reserved_spots and shifts.spots_filled are maintained by create_rsvp()
-- and the shift_signups trigger respectively, both SECURITY DEFINER. An admin
-- saving an edit through the panel must not clobber a live count.
--
-- Same mechanism as profiles above: revoke the table-wide UPDATE, then grant
-- back every column except the protected counter. `shifts.duration_hours` is a
-- generated column and is deliberately absent — generated columns cannot be
-- assigned to at all.
revoke update on public.events from authenticated;
grant update (
  title, title_es, description, description_es,
  starts_at, ends_at, location, category,
  total_spots, image_key, image_url, status, featured, published
) on public.events to authenticated;

revoke update on public.shifts from authenticated;
grant update (
  event_id, title, title_es, description, description_es,
  role, role_es, starts_at, ends_at, spots_total, published
) on public.shifts to authenticated;

-- ---------------------------------------------------------------------------
-- rsvps — contains attendee names, emails and phone numbers.
-- No public read of any kind. Inserts go exclusively through create_rsvp().
-- ---------------------------------------------------------------------------

create policy "rsvps: admins read"
  on public.rsvps for select
  to authenticated
  using (public.is_admin());

-- Deliberately read-only, for admins too. events.reserved_spots is maintained
-- by create_rsvp() alone; deleting an RSVP through PostgREST would leave the
-- seat count permanently overstated. Cancellations should go through a future
-- SECURITY DEFINER function that releases the seats in the same transaction.
revoke insert, update, delete on public.rsvps from anon, authenticated;

-- ---------------------------------------------------------------------------
-- shift_signups — a volunteer manages their own; admins see the roster.
-- ---------------------------------------------------------------------------

create policy "shift_signups: read own"
  on public.shift_signups for select
  to authenticated
  using (user_id = auth.uid());

create policy "shift_signups: claim own"
  on public.shift_signups for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "shift_signups: release own"
  on public.shift_signups for delete
  to authenticated
  using (user_id = auth.uid());

create policy "shift_signups: admins manage all"
  on public.shift_signups for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- donations & contact_messages — donor PII and inbound mail.
-- Written only by Edge Functions holding the service role key, which bypasses
-- RLS entirely; these policies exist to let admins read through the panel.
-- ---------------------------------------------------------------------------

create policy "donations: admins read"
  on public.donations for select
  to authenticated
  using (public.is_admin());

create policy "contact_messages: admins read"
  on public.contact_messages for select
  to authenticated
  using (public.is_admin());

create policy "contact_messages: admins update"
  on public.contact_messages for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke insert, update, delete on public.donations        from anon, authenticated;
revoke insert, delete         on public.contact_messages from anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_rsvp — the only path that writes an RSVP.
--
-- Capacity has to be checked and consumed atomically. The previous in-memory
-- implementation did `Math.min(totalSpots, reservedSpots + n)` on the client,
-- which silently overbooks whenever two people submit at once and cannot see
-- each other's pending writes. Taking a FOR UPDATE lock on the event row
-- serialises concurrent bookings.
-- ---------------------------------------------------------------------------

create function public.create_rsvp(
  p_event_id          uuid,
  p_full_name         text,
  p_email             text,
  p_phone             text default null,
  p_guest_count       integer default 0,
  p_optional_donation numeric default 0
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
begin
  if p_guest_count is null or p_guest_count < 0 or p_guest_count > 10 then
    raise exception 'invalid_guest_count' using errcode = 'PA004';
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

  -- The attendee occupies a seat too, hence +1.
  v_seats := p_guest_count + 1;

  if v_event.reserved_spots + v_seats > v_event.total_spots then
    raise exception 'event_full' using errcode = 'PA001';
  end if;

  begin
    insert into public.rsvps (event_id, full_name, email, phone, guest_count, optional_donation)
    values (
      p_event_id,
      btrim(p_full_name),
      lower(btrim(p_email)),
      nullif(btrim(coalesce(p_phone, '')), ''),
      p_guest_count,
      coalesce(p_optional_donation, 0)
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
grant execute on function public.create_rsvp(uuid, text, text, text, integer, numeric)
  to anon, authenticated;

-- Nothing else should be able to call the internal helpers.
revoke execute on function public.handle_new_user()        from anon, authenticated;
revoke execute on function public.sync_shift_spots_filled() from anon, authenticated;

-- ============================================================
-- ФАЙЛ: supabase/migrations/20260726120200_storage.sql
-- ============================================================

-- Storage bucket for admin-uploaded event and gallery photos.
--
-- Photos that ship with the app stay in src/assets and are referenced by
-- `image_key`; anything an admin uploads through the panel lands here and is
-- referenced by an absolute `image_url`. See resolveImage() in
-- src/lib/api/images.ts.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  -- Public read: these are photos on a public marketing site, and signed URLs
  -- would expire in the middle of a visitor's session for no benefit.
  true,
  5242880, -- 5 MB; the panel resizes in-browser before upload
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;

create policy "media: public read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'media');

create policy "media: admins upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'media' and public.is_admin());

create policy "media: admins update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'media' and public.is_admin())
  with check (bucket_id = 'media' and public.is_admin());

create policy "media: admins delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'media' and public.is_admin());

-- ============================================================
-- ФАЙЛ: supabase/migrations/20260727120000_oauth_profile_metadata.sql
-- ============================================================

-- Capture the name and avatar an OAuth provider supplies at signup.
--
-- With magic links the only thing known about a new user is their email, so
-- the original trigger read `full_name` and nothing else. Google returns a
-- display name and a profile picture, and the volunteer dashboard has slots
-- for both — without this they stay empty and the portal falls back to a
-- placeholder.
--
-- Key names differ by provider and by Supabase version: Google populates
-- `name`/`picture`, and Supabase normalises them to `full_name`/`avatar_url`.
-- Checking both is cheaper than depending on which one wins.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    nullif(btrim(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    )), ''),
    nullif(btrim(coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture',
      ''
    )), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Backfill anyone who signed up before this ran, and fill the gaps for users
-- who first arrived by magic link (no name) and later linked Google (name and
-- picture now present on the auth record). COALESCE keeps whatever the
-- volunteer has already set for themselves.
update public.profiles p
   set full_name  = coalesce(p.full_name, nullif(btrim(coalesce(
         u.raw_user_meta_data ->> 'full_name',
         u.raw_user_meta_data ->> 'name', '')), '')),
       avatar_url = coalesce(p.avatar_url, nullif(btrim(coalesce(
         u.raw_user_meta_data ->> 'avatar_url',
         u.raw_user_meta_data ->> 'picture', '')), ''))
  from auth.users u
 where u.id = p.id
   and (p.full_name is null or p.avatar_url is null);

-- ============================================================
-- ФАЙЛ: supabase/migrations/20260727120100_admin_delete_messages.sql
-- ============================================================

-- Let admins delete contact messages.
--
-- DELETE was revoked from everyone so an inbound enquiry could not be lost by
-- a stray click. In practice a public contact form collects spam, and making
-- staff open the SQL editor to clear each one is worse: they stop reading the
-- inbox at all.
--
-- Deliberately narrower than it looks:
--   * Only contact_messages. `rsvps` stays undeletable — removing one there
--     would strand events.reserved_spots, since the counter is maintained
--     separately by create_rsvp(). `donations` stays undeletable because it is
--     a financial record.
--   * Only admins, enforced by the policy below, not by hiding a button.
--
-- The UI asks for confirmation and shows what is about to be removed, but
-- that is courtesy; this policy is the actual control.

grant delete on public.contact_messages to authenticated;

create policy "contact_messages: admins delete"
  on public.contact_messages for delete
  to authenticated
  using (public.is_admin());

-- ============================================================
-- ФАЙЛ: supabase/migrations/20260727130000_service_log.sql
-- ============================================================

-- PAWTX — verified service hours.
--
-- Until now a volunteer's "hours served" were computed in the browser as the
-- sum of every shift they had claimed whose end time had passed. Nobody
-- checked whether they turned up. That is tolerable for a dashboard counter
-- and unacceptable for the service letters this ledger is meant to back:
-- those are handed to schools and courts, and the organisation signs them.
--
-- So the two facts are now separate. `shift_signups.attendance` records what
-- staff observed on the day. `service_log` records credited hours, and a row
-- exists only because an admin put it there — which is why the table has no
-- "pending" state to filter on and a certificate can read all of it.
--
-- Every statement below is safe to run twice. `supabase db push` tracks what
-- it has applied and would not need that, but this file also gets pasted into
-- the SQL editor by hand — and there, a run that fails part way through leaves
-- a database the original all-or-nothing version could never be applied to
-- again.

-- ---------------------------------------------------------------------------
-- Attendance, on the roster row that already exists per volunteer per shift.
-- ---------------------------------------------------------------------------

alter table public.shift_signups
  add column if not exists attendance text;

-- Added separately from the column: `add column if not exists` skips the whole
-- clause when the column is already there, so folding the CHECK into it would
-- leave the values unconstrained on any database where an earlier attempt got
-- this far.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.shift_signups'::regclass
       and conname = 'shift_signups_attendance_check'
  ) then
    alter table public.shift_signups
      add constraint shift_signups_attendance_check
      check (attendance in ('attended', 'no_show'));
  end if;
end $$;

comment on column public.shift_signups.attendance is
  'Null means the roster has not been closed yet — which is how staff find the shifts still waiting to be processed. Only admins can set it: volunteers have select, insert and delete policies on this table but no update policy, so an UPDATE from one is refused by RLS.';

-- ---------------------------------------------------------------------------
-- service_log — the single source of credited hours.
-- ---------------------------------------------------------------------------

create table if not exists public.service_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  -- Null for hours worked outside the shift system, and on purpose when a
  -- shift is later deleted: the volunteer served those hours either way, so
  -- the credit must not disappear with the schedule entry.
  shift_id    uuid references public.shifts (id) on delete set null,
  source      text not null check (source in ('shift', 'manual')),
  hours       numeric(5, 2) not null check (hours > 0 and hours <= 24),
  served_on   date not null,
  note        text check (length(note) <= 500),
  -- Who signed off. Not nullable: an unattributed row is exactly the kind of
  -- entry a service letter must not be built on.
  verified_by uuid not null references public.profiles (id),
  verified_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

-- One credit per volunteer per shift, so re-closing a roster corrects the
-- existing row instead of paying the hours twice.
create unique index if not exists service_log_one_per_shift_idx
  on public.service_log (user_id, shift_id)
  where shift_id is not null;

create index if not exists service_log_user_served_idx
  on public.service_log (user_id, served_on desc);

-- A CHECK constraint cannot call current_date — it has to be immutable — so
-- the "not in the future" rule lives in a trigger. Without it a mistyped year
-- silently credits hours nobody has served yet.
create or replace function public.service_log_reject_future()
returns trigger
language plpgsql
as $$
begin
  if new.served_on > current_date then
    raise exception 'service_log.served_on is in the future (%)', new.served_on
      using errcode = 'PA005';
  end if;
  return new;
end;
$$;

drop trigger if exists service_log_no_future_dates on public.service_log;
create trigger service_log_no_future_dates
  before insert or update on public.service_log
  for each row execute function public.service_log_reject_future();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.service_log enable row level security;

-- Postgres has no `create policy if not exists`, so each is dropped first.
drop policy if exists "service_log: read own"        on public.service_log;
drop policy if exists "service_log: admins read all" on public.service_log;
drop policy if exists "service_log: admins write"    on public.service_log;

create policy "service_log: read own"
  on public.service_log for select
  to authenticated
  using (user_id = auth.uid());

create policy "service_log: admins read all"
  on public.service_log for select
  to authenticated
  using (public.is_admin());

-- Note the second half of the WITH CHECK: an admin may credit anyone, but only
-- under their own name. Without it the audit trail could be pointed at a
-- colleague, which is worse than having no audit trail at all.
create policy "service_log: admins write"
  on public.service_log for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin() and verified_by = auth.uid());

-- A volunteer has no insert or update policy here, so they cannot log their
-- own hours. That is the whole point of the table.

revoke execute on function public.service_log_reject_future() from anon, authenticated;

-- ============================================================
-- ФАЙЛ: supabase/migrations/20260727140000_service_log_upsert_index.sql
-- ============================================================

-- Make closing a roster actually work.
--
-- The unique index on (user_id, shift_id) was partial — `where shift_id is not
-- null`. That reads as exactly the right rule, and it broke the only write it
-- existed to support: Postgres will only infer a partial index for ON CONFLICT
-- when the statement repeats the index predicate, and PostgREST's upsert sends
-- column names and nothing else. So every attempt to credit hours failed with
-- 42P10, "no unique or exclusion constraint matching the ON CONFLICT
-- specification".
--
-- A plain unique index enforces the same rule. NULLs are distinct in a unique
-- index, so a volunteer can still hold any number of manual entries with no
-- shift attached, while a given shift can still credit them only once.

drop index if exists public.service_log_one_per_shift_idx;

create unique index if not exists service_log_one_per_shift_idx
  on public.service_log (user_id, shift_id);

-- ============================================================
-- ФАЙЛ: supabase/migrations/20260727150000_volunteer_documents.sql
-- ============================================================

-- PAWTX — volunteer onboarding paperwork, signatures, and service certificates.
--
-- Three things this schema is built around, each of which a simpler design
-- gets wrong in a way that only shows up in a dispute:
--
--  1. A signature is worthless unless you can prove WHAT was signed. Documents
--     are therefore versioned and immutable, each version carries a hash of its
--     own text, and every signature records the hash it agreed to. "accepted =
--     true" on a profile proves nothing a year later when the text has changed.
--
--  2. A certificate is a snapshot, not a live query. Hours get corrected — a
--     roster reopened, a no-show reversed — and a document already handed to a
--     school must not silently change underneath it. The totals are frozen at
--     issue and the underlying entries stored alongside them.
--
--  3. Verification must reveal the minimum. The public lookup is a function,
--     not a readable table: it takes an unguessable number and returns the
--     name, hours and period. Never the email, phone, address, or date of
--     birth that the rest of these tables hold.

-- ---------------------------------------------------------------------------
-- Versioned documents
-- ---------------------------------------------------------------------------

create table if not exists public.legal_documents (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null,
  title_es    text not null,
  -- Drives the onboarding flow: which papers a given volunteer must sign, and
  -- which additionally require a guardian when the volunteer is a minor.
  kind        text not null check (kind in (
                'application', 'agreement', 'release', 'media_consent',
                'guardian_consent', 'code_of_conduct'
              )),
  required    boolean not null default true,
  minors_only boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.legal_document_versions (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references public.legal_documents (id) on delete cascade,
  version        text not null,
  effective_from date not null,
  body_md        text not null,
  body_md_es     text not null,
  -- sha-256 of body_md, computed on insert. A signature stores this value, so
  -- an altered document can never be passed off as the one somebody signed.
  body_hash      text not null,
  is_current     boolean not null default false,
  created_at     timestamptz not null default now(),

  unique (document_id, version)
);

-- Exactly one current version per document.
create unique index if not exists legal_document_versions_one_current_idx
  on public.legal_document_versions (document_id)
  where is_current;

create or replace function public.legal_document_versions_set_hash()
returns trigger
language plpgsql
as $$
begin
  new.body_hash := encode(extensions.digest(new.body_md, 'sha256'), 'hex');
  return new;
end;
$$;

drop trigger if exists legal_document_versions_hash on public.legal_document_versions;
create trigger legal_document_versions_hash
  before insert or update of body_md on public.legal_document_versions
  for each row execute function public.legal_document_versions_set_hash();

-- Published text is public on purpose: somebody has to be able to read what
-- they are about to sign before they have an account.
alter table public.legal_documents         enable row level security;
alter table public.legal_document_versions enable row level security;

drop policy if exists "legal_documents: public read" on public.legal_documents;
create policy "legal_documents: public read"
  on public.legal_documents for select to anon, authenticated using (true);

drop policy if exists "legal_documents: admins write" on public.legal_documents;
create policy "legal_documents: admins write"
  on public.legal_documents for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "document_versions: public read current" on public.legal_document_versions;
create policy "document_versions: public read current"
  on public.legal_document_versions for select to anon, authenticated
  using (is_current or public.is_admin());

drop policy if exists "document_versions: admins write" on public.legal_document_versions;
create policy "document_versions: admins write"
  on public.legal_document_versions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Applications
-- ---------------------------------------------------------------------------

create table if not exists public.volunteer_applications (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references public.profiles (id) on delete set null,
  full_name         text not null check (length(btrim(full_name)) between 1 and 120),
  email             text not null check (position('@' in email) > 1),
  phone             text,
  date_of_birth     date not null,
  -- Frozen at submission. Age is not a stored fact that stays true, and every
  -- consent question ("did this need a guardian?") is about the day it was
  -- signed, not about today.
  was_minor_at_submission boolean not null,
  address_line      text,
  city              text,
  state             text,
  postal_code       text,
  emergency_name    text not null,
  emergency_phone   text not null,
  emergency_relation text,
  skills            text,
  availability      text,
  languages         text,
  -- Youth programmes: see the code of conduct and the screening note in
  -- legal/README.md. Nothing here decides anything on its own.
  interested_in_youth_programs boolean not null default false,
  motivation        text,
  status            text not null default 'submitted'
                      check (status in ('submitted', 'in_review', 'approved', 'declined', 'withdrawn')),
  reviewed_by       uuid references public.profiles (id),
  reviewed_at       timestamptz,
  review_note       text,
  created_at        timestamptz not null default now()
);

create index if not exists volunteer_applications_status_idx
  on public.volunteer_applications (status, created_at desc);

alter table public.volunteer_applications enable row level security;

drop policy if exists "applications: read own" on public.volunteer_applications;
create policy "applications: read own"
  on public.volunteer_applications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "applications: submit own" on public.volunteer_applications;
create policy "applications: submit own"
  on public.volunteer_applications for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "applications: admins manage" on public.volunteer_applications;
create policy "applications: admins manage"
  on public.volunteer_applications for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- An applicant must not be able to approve themselves. Same mechanism as
-- profiles.role: revoke the table-wide UPDATE, grant back only what they own.
revoke update on public.volunteer_applications from authenticated;
grant update (
  phone, address_line, city, state, postal_code,
  emergency_name, emergency_phone, emergency_relation,
  skills, availability, languages, motivation
) on public.volunteer_applications to authenticated;

-- ---------------------------------------------------------------------------
-- Signatures
-- ---------------------------------------------------------------------------

create table if not exists public.document_signatures (
  id             uuid primary key default gen_random_uuid(),
  version_id     uuid not null references public.legal_document_versions (id),
  user_id        uuid references public.profiles (id) on delete set null,
  application_id uuid references public.volunteer_applications (id) on delete cascade,

  -- Typed name plus intent, which is what ESIGN and the Texas UETA actually
  -- require. A checkbox with no name attached is far weaker evidence.
  signer_name    text not null check (length(btrim(signer_name)) between 1 and 120),
  signer_email   text not null,
  signer_role    text not null check (signer_role in ('volunteer', 'guardian')),
  -- Present when signer_role = 'guardian': who they are signing for.
  minor_name     text,
  relationship   text,

  -- The exact text agreed to. Copied from the version at signing time rather
  -- than joined at read time, so it survives the version row being corrected.
  body_hash      text not null,
  signed_at      timestamptz not null default now(),
  ip_address     inet,
  user_agent     text,

  constraint guardian_names_the_minor
    check (signer_role <> 'guardian' or minor_name is not null)
);

create index if not exists document_signatures_user_idx
  on public.document_signatures (user_id, signed_at desc);

create index if not exists document_signatures_application_idx
  on public.document_signatures (application_id);

alter table public.document_signatures enable row level security;

drop policy if exists "signatures: read own" on public.document_signatures;
create policy "signatures: read own"
  on public.document_signatures for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "signatures: sign own" on public.document_signatures;
create policy "signatures: sign own"
  on public.document_signatures for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "signatures: admins read" on public.document_signatures;
create policy "signatures: admins read"
  on public.document_signatures for select to authenticated
  using (public.is_admin());

-- Nobody edits or deletes a signature, admins included. An execution record
-- that can be altered after the fact is not evidence of anything.
revoke update, delete on public.document_signatures from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Certificates
-- ---------------------------------------------------------------------------

create table if not exists public.volunteer_certificates (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,

  -- Printed on the document and encoded in the QR. Unguessable by design:
  -- sequential numbering would let anyone enumerate every certificate the
  -- organisation has ever issued.
  certificate_no text not null unique,

  -- Snapshots. Deliberately not recomputed on read — see the header.
  recipient_name text not null,
  period_start   date not null,
  period_end     date not null,
  total_hours    numeric(6, 2) not null check (total_hours >= 0),
  entry_count    integer not null default 0,
  entries        jsonb not null default '[]'::jsonb,

  issued_by      uuid not null references public.profiles (id),
  issued_by_name text not null,
  issued_by_title text,
  issued_at      timestamptz not null default now(),

  revoked_at     timestamptz,
  revoked_reason text,

  constraint certificate_period_ordered check (period_end >= period_start)
);

create index if not exists volunteer_certificates_user_idx
  on public.volunteer_certificates (user_id, issued_at desc);

alter table public.volunteer_certificates enable row level security;

drop policy if exists "certificates: read own" on public.volunteer_certificates;
create policy "certificates: read own"
  on public.volunteer_certificates for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "certificates: admins manage" on public.volunteer_certificates;
create policy "certificates: admins manage"
  on public.volunteer_certificates for all to authenticated
  using (public.is_admin()) with check (public.is_admin() and issued_by = auth.uid());

-- Issued figures are frozen. Only revocation is possible afterwards, which is
-- how a certificate sent in error is withdrawn without rewriting history.
revoke update on public.volunteer_certificates from authenticated;
grant update (revoked_at, revoked_reason) on public.volunteer_certificates to authenticated;

-- ---------------------------------------------------------------------------
-- Public verification
--
-- A function rather than a table policy. Anonymous callers get exactly these
-- columns for exactly one certificate number they already hold — no listing,
-- no PII, and no way to widen the query.
-- ---------------------------------------------------------------------------

create or replace function public.verify_certificate(p_certificate_no text)
returns table (
  certificate_no  text,
  recipient_name  text,
  total_hours     numeric,
  period_start    date,
  period_end      date,
  issued_at       timestamptz,
  issued_by_name  text,
  issued_by_title text,
  is_valid        boolean,
  revoked_at      timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.certificate_no,
    c.recipient_name,
    c.total_hours,
    c.period_start,
    c.period_end,
    c.issued_at,
    c.issued_by_name,
    c.issued_by_title,
    c.revoked_at is null as is_valid,
    c.revoked_at
  from public.volunteer_certificates c
  where upper(btrim(c.certificate_no)) = upper(btrim(p_certificate_no));
$$;

grant execute on function public.verify_certificate(text) to anon, authenticated;

revoke execute on function public.legal_document_versions_set_hash() from anon, authenticated;

-- ============================================================
-- ФАЙЛ: supabase/migrations/20260727160000_seed_legal_documents.sql
-- ============================================================

-- Generated by scripts/generate-legal-seed.mjs from legal/*.md. Do not hand-edit —
-- regenerate instead, or this file and the drafts it came from will drift apart.
--
-- Idempotent: upserts by slug/version, safe to paste into the SQL editor twice.
--
-- The English body still carries "Draft — not for use until reviewed by a
-- Texas-licensed attorney" on purpose. It is the guardrail that stops this
-- from being put in front of a real volunteer or a real parent before that
-- review has happened — see legal/README.md. Remove that sentence from the
-- markdown (and regenerate) only once counsel has signed off.

-- ---------------------------------------------------------------------------
-- volunteer-application
-- ---------------------------------------------------------------------------

insert into public.legal_documents (slug, title, title_es, kind, required, minors_only, sort_order)
values ($doc$volunteer-application$doc$, $doc$Volunteer Application$doc$, $doc$Solicitud de Voluntariado$doc$, $doc$application$doc$, true, false, 10)
on conflict (slug) do update set
  title = excluded.title, title_es = excluded.title_es, kind = excluded.kind,
  minors_only = excluded.minors_only, sort_order = excluded.sort_order;

with doc as (
  select id from public.legal_documents where slug = $doc$volunteer-application$doc$
)
insert into public.legal_document_versions (document_id, version, effective_from, body_md, body_md_es, is_current)
select doc.id, '1.0', current_date,
  $doc$**Peace Academy of West Texas** — 3411 Brentwood Drive, Odessa, Texas 79762.

> **Draft — not for use until reviewed by a Texas-licensed attorney.**
>
> This is the field specification for the application form, and the notices
> that must appear on it. The fields map to `public.volunteer_applications`.

---

## Notice shown at the top of the form

> We ask for this information to place you in a role that suits you, to reach
> you about shifts, and to contact someone on your behalf if you are hurt while
> volunteering. **We do not sell it, and we do not share it outside Peace
> Academy of West Texas** except where the law requires.
>
> Applying does not commit you to anything. Nothing is scheduled until you
> choose a shift.

## Fields

### About you

| Field | Required | Notes |
|---|---|---|
| Full legal name | yes | As it should appear on a certificate of service |
| Email | yes | Also the sign-in address |
| Phone | no | |
| Date of birth | yes | Determines whether guardian consent is required. **Not** used for eligibility beyond that |
| Street address, city, state, ZIP | no | Asked because some grant reporting is by county |
| Preferred language | no | English / Spanish / other |

**Minimum age for self-registration is 13.** Someone younger is enrolled by a
parent, who completes the form on their behalf. This keeps the portal clear of
the verifiable-parental-consent obligations that COPPA attaches to collecting
personal information online from a child under 13.

### Emergency contact

| Field | Required |
|---|---|
| Name | yes |
| Phone | yes |
| Relationship to you | no |

Stated on the form: *"We will only use this if you are hurt or taken ill while
volunteering and we cannot reach you."*

### What you would like to do

| Field | Required | Notes |
|---|---|---|
| Areas of interest | no | Multi-select from the six volunteer roles |
| Skills and experience | no | Free text — languages spoken, food handling, first aid, driving, trades |
| Availability | no | Free text or day/time grid |
| Interested in youth programmes | no | Checkbox. **Screening applies before any unsupervised contact with minors — see the note below** |
| Why you would like to volunteer | no | Free text |

### What is deliberately not asked

- **Criminal history.** Not on the general application. Screening, where it is
  required, is a separate step with its own authorisation and its own FCRA
  obligations if a consumer reporting agency is used. Asking everyone on the
  first form is both unnecessary and a legal exposure of its own.
- **Immigration or citizenship status.** Irrelevant to volunteering and not the
  Organization's business.
- **Health conditions.** Only what someone chooses to disclose so their role can
  be made safe. Do not ask for a medical history.
- **Social security number.** Never, for a volunteer.

## Notice shown above the submit button

> Submitting this application does not make you a volunteer. We will review it
> and get in touch. Before your first shift you will be asked to read and sign
> the Volunteer Agreement, the Release and Waiver, and the Code of Conduct.
> Photo consent is separate, and optional.

## After submission

Status moves through `submitted → in_review → approved | declined`. A volunteer
may withdraw at any time (`withdrawn`).

Retention: **to be set by the attorney.** Applications, dates of birth and
emergency contacts should not be kept indefinitely, and nothing in the schema
purges them today.$doc$,
  $doc$[Spanish translation pending attorney-reviewed English text. Contact paowtx@gmail.com for this document in Spanish.]$doc$,
  true
from doc
on conflict (document_id, version) do update set
  body_md = excluded.body_md, body_md_es = excluded.body_md_es, is_current = true;

-- ---------------------------------------------------------------------------
-- volunteer-agreement
-- ---------------------------------------------------------------------------

insert into public.legal_documents (slug, title, title_es, kind, required, minors_only, sort_order)
values ($doc$volunteer-agreement$doc$, $doc$Volunteer Agreement$doc$, $doc$Acuerdo de Voluntariado$doc$, $doc$agreement$doc$, true, false, 20)
on conflict (slug) do update set
  title = excluded.title, title_es = excluded.title_es, kind = excluded.kind,
  minors_only = excluded.minors_only, sort_order = excluded.sort_order;

with doc as (
  select id from public.legal_documents where slug = $doc$volunteer-agreement$doc$
)
insert into public.legal_document_versions (document_id, version, effective_from, body_md, body_md_es, is_current)
select doc.id, '1.0', current_date,
  $doc$**Peace Academy of West Texas** — 3411 Brentwood Drive, Odessa, Texas 79762.

> **Draft — not for use until reviewed by a Texas-licensed attorney.**

This agreement sets out what the Organization asks of its volunteers and what
volunteers can expect in return. It is not an employment contract.

---

## 1. Volunteer status

I am serving as a volunteer. I understand and agree that:

- **I am not an employee** of the Organization, and this agreement creates no
  employment relationship, no contract of employment, and no expectation of
  continued service.
- **I serve without compensation.** I am not entitled to wages, salary, stipend,
  or any other payment for my time, and I am not volunteering in the expectation
  of future paid work.
- I am not covered by the Organization's workers' compensation insurance (if
  any), nor by health, disability or accident insurance provided by it.
- Volunteer work will not displace a paid employee or duplicate work the
  Organization pays someone else to do.

The Organization may reimburse pre-approved out-of-pocket expenses. Any
reimbursement requires a receipt and prior approval, and is a reimbursement of
cost rather than payment for time.

## 2. What the Organization commits to

- To tell me what a role involves before I take it on, and to provide the
  orientation and training that role needs.
- To provide a named supervisor for each activity and a way to reach them.
- To treat me with respect, and to apply its non-discrimination and
  anti-harassment commitments to volunteers as it does to staff.
- To keep the personal information I provide confidential, and to use it only to
  run its volunteer programme.
- To keep an accurate record of the hours I serve, and to provide a certificate
  of service on request.

## 3. What I commit to

- To arrive when I have said I will, and to give as much notice as I can when I
  cannot — a shift left unfilled is usually a service that does not happen.
- To follow the Code of Conduct (`06-code-of-conduct.md`), which I have read.
- To follow the reasonable instructions of my supervisor, and safety rules in
  particular.
- To work within the role I have been given, and to ask before doing anything
  outside it. I will not represent myself as speaking for the Organization, or
  make commitments on its behalf, without written authorisation.
- To report accidents, injuries, near-misses and property damage to my
  supervisor **the same day**.
- Not to volunteer while under the influence of alcohol or of any drug that
  impairs my ability to serve safely.

## 4. Confidentiality

In the course of volunteering I may learn personal information about
programme participants, donors, other volunteers, or families receiving
assistance. **I will not disclose it to anyone outside the Organization, and I
will not use it for any purpose of my own.** This obligation continues after I
stop volunteering. If I am unsure whether something is confidential, I will
treat it as if it is and ask my supervisor.

## 5. Hours and records

Hours are credited by staff after an activity, on the basis of attendance
actually observed. Signing up for a shift is not the same as serving it. I may
view my recorded hours at any time in the volunteer portal, and I will raise any
discrepancy promptly, while it can still be checked.

## 6. Media

Photography and video consent is given separately, in `04-media-consent.md`. It
is optional, and declining it does not affect my ability to volunteer.

## 7. Ending the arrangement

Either of us may end this arrangement at any time, with or without reason and
without notice. The Organization may also suspend or remove me from an activity
immediately where it believes there is a risk to a participant, another
volunteer, or the Organization. Sections 4 (Confidentiality) and any obligation
under `03-release-and-waiver.md` survive.

## 8. Equal opportunity

The Organization welcomes volunteers without regard to race, colour, national
origin, ancestry, religion, sex, sexual orientation, gender identity, age,
disability, veteran status, or any other characteristic protected by law. I may
ask for a reasonable accommodation at any time by writing to paowtx@gmail.com,
and doing so will not count against me.

## 9. General

This agreement is governed by Texas law. It replaces any prior understanding
about my volunteer service. If any part is unenforceable, the rest stands.$doc$,
  $doc$[Spanish translation pending attorney-reviewed English text. Contact paowtx@gmail.com for this document in Spanish.]$doc$,
  true
from doc
on conflict (document_id, version) do update set
  body_md = excluded.body_md, body_md_es = excluded.body_md_es, is_current = true;

-- ---------------------------------------------------------------------------
-- release-and-waiver
-- ---------------------------------------------------------------------------

insert into public.legal_documents (slug, title, title_es, kind, required, minors_only, sort_order)
values ($doc$release-and-waiver$doc$, $doc$Release, Waiver of Liability, and Assumption of Risk$doc$, $doc$Exención de Responsabilidad y Aceptación de Riesgos$doc$, $doc$release$doc$, true, false, 30)
on conflict (slug) do update set
  title = excluded.title, title_es = excluded.title_es, kind = excluded.kind,
  minors_only = excluded.minors_only, sort_order = excluded.sort_order;

with doc as (
  select id from public.legal_documents where slug = $doc$release-and-waiver$doc$
)
insert into public.legal_document_versions (document_id, version, effective_from, body_md, body_md_es, is_current)
select doc.id, '1.0', current_date,
  $doc$**Peace Academy of West Texas** — a Texas non-profit corporation, 3411 Brentwood
Drive, Odessa, Texas 79762 (the "Organization").

> **Draft — not for use until reviewed by a Texas-licensed attorney.** See
> `legal/README.md`. If the signer is under 18, this document is signed by the
> volunteer *and* by a parent or guardian under `05-guardian-consent.md`, and
> the limits described there apply.

**Read this before signing. It affects your legal rights.**

---

## 1. Activities covered

I am volunteering with the Organization. My activities may include, without
limitation: preparing and serving food; setting up, running and dismantling
events indoors and outdoors; lifting and carrying supplies; assembling and
distributing relief packages; greeting and assisting the public; interpreting
and translating; supporting youth and sports programming; and travelling
between sites (together, the "Activities").

## 2. Assumption of risk

I understand that the Activities carry risks that cannot be eliminated, however
carefully the Organization conducts them. These include, without limitation:
slips, trips and falls; cuts, burns and injuries from kitchen equipment and hand
tools; strains and crush injuries from lifting or moving heavy objects; heat
exhaustion, heat stroke, sunburn and dehydration during outdoor events in West
Texas; allergic reactions, including to foods and cleaning products;
communicable illness; injury caused by other volunteers, participants, members
of the public, or animals; property damage or loss; and the risks of travelling
to and from sites, including motor vehicle collisions.

I understand this list is not complete, and that there may be risks not now
foreseeable. **I knowingly and voluntarily accept these risks** and choose to
participate anyway.

## 3. Fitness and medical care

I represent that I am physically able to perform the Activities I take on, and
that I will tell my supervisor about any condition, allergy, or limitation that
could affect my safety or anyone else's. I authorise the Organization to obtain
emergency medical care for me if I am unable to consent, and I accept financial
responsibility for that care. I understand **the Organization does not provide
health, medical, disability or workers' compensation insurance for volunteers**
and that I am responsible for my own coverage.

## 4. Release of claims

> ### ⚠ READ THIS PARAGRAPH CAREFULLY. IT RELEASES CLAIMS FOR THE ORGANIZATION'S OWN NEGLIGENCE.
>
> **IN EXCHANGE FOR BEING PERMITTED TO VOLUNTEER, I RELEASE, WAIVE AND DISCHARGE
> PEACE ACADEMY OF WEST TEXAS, ITS DIRECTORS, OFFICERS, EMPLOYEES, AGENTS,
> VOLUNTEERS AND PROPERTY OWNERS WHOSE PREMISES ARE USED (THE "RELEASED
> PARTIES") FROM ALL LIABILITY, CLAIMS, DEMANDS AND CAUSES OF ACTION FOR ANY
> INJURY, DEATH, ILLNESS, OR LOSS OF OR DAMAGE TO PROPERTY THAT I SUFFER
> ARISING OUT OF THE ACTIVITIES — INCLUDING ANY SUCH INJURY, DEATH, ILLNESS,
> LOSS OR DAMAGE CAUSED IN WHOLE OR IN PART BY THE ORDINARY NEGLIGENCE OF ANY
> OF THE RELEASED PARTIES.**
>
> **I UNDERSTAND THAT I AM GIVING UP SUBSTANTIAL RIGHTS, INCLUDING MY RIGHT TO
> SUE THE RELEASED PARTIES FOR THEIR OWN NEGLIGENCE.**

This release does **not** apply to gross negligence, wilful or wanton
misconduct, intentional wrongdoing, or any liability that Texas law does not
permit to be released.

## 5. Indemnity

I agree to indemnify and hold the Released Parties harmless from any claim
brought by a third party arising out of my own negligent or wrongful act or
omission during the Activities. This does not require me to indemnify a
Released Party against that party's own negligence.

## 6. Statutory protections preserved

Nothing in this document waives or limits any protection available to the
Organization or to volunteers under the Texas Charitable Immunity and Liability
Act (Tex. Civ. Prac. & Rem. Code ch. 84) or the federal Volunteer Protection
Act of 1997 (42 U.S.C. §14501 et seq.).

## 7. General

This document is governed by the laws of the State of Texas, without regard to
conflict-of-laws rules. Venue for any dispute lies in Ector County, Texas. If
any part is held unenforceable, the rest remains in force, and the
unenforceable part is to be given the narrowest reading that is enforceable.
This release binds my heirs, personal representatives and assigns.

I have read this document in full. **I understand it is a release of liability
and a contract, and I sign it freely.** No one has told me it is merely a
formality.$doc$,
  $doc$[Spanish translation pending attorney-reviewed English text. Contact paowtx@gmail.com for this document in Spanish.]$doc$,
  true
from doc
on conflict (document_id, version) do update set
  body_md = excluded.body_md, body_md_es = excluded.body_md_es, is_current = true;

-- ---------------------------------------------------------------------------
-- media-consent
-- ---------------------------------------------------------------------------

insert into public.legal_documents (slug, title, title_es, kind, required, minors_only, sort_order)
values ($doc$media-consent$doc$, $doc$Photo and Media Consent$doc$, $doc$Consentimiento de Fotografía y Medios$doc$, $doc$media_consent$doc$, true, false, 40)
on conflict (slug) do update set
  title = excluded.title, title_es = excluded.title_es, kind = excluded.kind,
  minors_only = excluded.minors_only, sort_order = excluded.sort_order;

with doc as (
  select id from public.legal_documents where slug = $doc$media-consent$doc$
)
insert into public.legal_document_versions (document_id, version, effective_from, body_md, body_md_es, is_current)
select doc.id, '1.0', current_date,
  $doc$**Peace Academy of West Texas** — 3411 Brentwood Drive, Odessa, Texas 79762.

> **Draft — not for use until reviewed by a Texas-licensed attorney.**
>
> **This consent is optional.** Declining it must not affect anyone's ability to
> volunteer or to take part in a programme, and the onboarding flow is built so
> that "no" is a normal outcome rather than a blocked path.

---

## 1. What is being asked

The Organization photographs and films its events — cooking classes, cultural
festivals, relief drives, seminars — and uses the results to show what it does
and to raise support. This form asks whether your image may be included.

## 2. What you are consenting to, if you say yes

Permission for the Organization to record my image, likeness, voice and first
name at its activities, and to reproduce, publish and distribute those
recordings:

- on the PAWTX website and its social media accounts;
- in printed material such as brochures, flyers, newsletters and annual reports;
- in grant applications and reports to funders;
- in local press coverage of PAWTX activities.

This permission is granted worldwide, without a time limit except as described
in section 5, and without payment. I understand the Organization may crop, edit
or caption the material, and I waive any right to inspect or approve a
particular use in advance.

## 3. What is not being asked for

The Organization will **not**:

- publish my surname, address, telephone number or email alongside my image;
- publish my image in a way that suggests I endorse a commercial product, a
  political candidate, or a religious position;
- sell or license my image to a third party for their own advertising;
- publish an image of a minor without the consent recorded under
  `05-guardian-consent.md`.

## 4. Choose one

- ☐ **Yes** — I consent as described above.
- ☐ **Photographs only** — I consent to still photography but not to video or
  audio recording.
- ☐ **No** — I do not consent. Please do not include me in photographs or
  recordings intended for publication.

If you choose "No", tell the person with the camera at an event as well.
Consent recorded here is honoured by staff, but a volunteer photographer at a
crowded festival cannot check a list in the moment.

## 5. Withdrawing consent

I may withdraw this consent at any time by writing to **paowtx@gmail.com**.

**Withdrawal applies going forward.** On withdrawal the Organization will,
within 30 days, stop using my image in new material and remove it from the
website and from social media accounts it controls where it can reasonably be
identified. It **cannot** recall material already printed and distributed, or
copies already shared or reposted by others, and it does not undertake to do
so. Archived material held for the Organization's own records may be retained.

## 6. Minors

Where the person recorded is under 18, this consent has no effect unless a
parent or guardian has signed `05-guardian-consent.md`. **For minors the
default is no.**$doc$,
  $doc$[Spanish translation pending attorney-reviewed English text. Contact paowtx@gmail.com for this document in Spanish.]$doc$,
  true
from doc
on conflict (document_id, version) do update set
  body_md = excluded.body_md, body_md_es = excluded.body_md_es, is_current = true;

-- ---------------------------------------------------------------------------
-- guardian-consent
-- ---------------------------------------------------------------------------

insert into public.legal_documents (slug, title, title_es, kind, required, minors_only, sort_order)
values ($doc$guardian-consent$doc$, $doc$Parent / Guardian Consent for a Volunteer Under 18$doc$, $doc$Consentimiento de Padre/Tutor para un Voluntario Menor de 18$doc$, $doc$guardian_consent$doc$, true, true, 50)
on conflict (slug) do update set
  title = excluded.title, title_es = excluded.title_es, kind = excluded.kind,
  minors_only = excluded.minors_only, sort_order = excluded.sort_order;

with doc as (
  select id from public.legal_documents where slug = $doc$guardian-consent$doc$
)
insert into public.legal_document_versions (document_id, version, effective_from, body_md, body_md_es, is_current)
select doc.id, '1.0', current_date,
  $doc$**Peace Academy of West Texas** — 3411 Brentwood Drive, Odessa, Texas 79762.

> **Draft — not for use until reviewed by a Texas-licensed attorney.**
>
> **Read this note before adapting the document.** It is deliberately *not*
> drafted as a waiver of the minor's claims. Under *Munoz v. II Jaz Inc.*,
> 863 S.W.2d 207 (Tex. App.—Houston [14th Dist.] 1993), a parent's authority
> over a child does not extend to releasing the child's own cause of action,
> and a clause purporting to do so is very likely unenforceable in Texas.
>
> Adding one would not make the Organization safer. It would add a clause a
> court strikes, and invite the argument that the document as a whole was
> written to overreach. What protects minors here is insurance, supervision
> and screening — not paperwork. See `legal/README.md`.

---

I am the parent or legal guardian of the minor named below (the "Minor"), and I
have the legal authority to make this decision for them.

## 1. Consent to participate

I consent to the Minor volunteering with the Organization and taking part in its
activities, which may include preparing and serving food, setting up and running
indoor and outdoor events, assembling and distributing relief packages,
assisting the public, and supporting youth and sports programming.

I understand the Minor will be supervised by Organization staff or approved
adult volunteers, and I have discussed the Code of Conduct
(`06-code-of-conduct.md`) with them.

## 2. Acknowledgement of risk

I have read the description of risks in the Release and Waiver
(`03-release-and-waiver.md`) and I understand them. They include, among others,
injuries from kitchen equipment and hand tools, lifting injuries, heat illness
during outdoor events in West Texas, allergic reactions, communicable illness,
and injury caused by other people present.

**I accept that these risks exist and I consent to the Minor's participation
with that understanding.**

## 3. Transportation

Please indicate one:

- ☐ The Minor will be brought to and collected from activities by me or by an
  adult I authorise.
- ☐ I authorise the Organization to transport the Minor in a vehicle driven by
  a screened adult volunteer or staff member.
- ☐ I authorise the Minor to travel to and from activities independently.

## 4. Emergency medical authorisation

If the Minor is injured or becomes ill and I cannot be reached in time, I
authorise the Organization to seek emergency medical treatment for them,
including transport by ambulance. I accept financial responsibility for that
treatment. I understand **the Organization does not provide medical or accident
insurance for volunteers.**

- Known allergies, conditions, or medications: `_______________`
- Health insurance carrier and policy number (optional): `_______________`

## 5. Release of my own claims, and indemnity

**This section releases my own claims. It does not release, and does not
purport to release, any claim belonging to the Minor.**

To the extent permitted by Texas law, I release the Organization, its
directors, officers, employees, agents and volunteers from claims **that I
personally** may have arising out of the Minor's participation, including
claims for my own loss of the Minor's services or companionship and for
expenses I incur — **including where such a claim arises in whole or in part
from the ordinary negligence of the Organization.** This does not extend to
gross negligence, wilful or wanton misconduct, or intentional wrongdoing.

I agree to indemnify the Organization against claims brought by a third party
arising from the Minor's own wrongful act.

## 6. Media

Consent to photography and video of the Minor is given separately, in
`04-media-consent.md`, and may be declined without affecting the Minor's ability
to volunteer. **Consent for a minor is off by default and requires this
signature.**

## 7. Communication

The Organization will send scheduling messages to me as well as to the Minor. I
may withdraw this consent at any time by writing to paowtx@gmail.com, which
also withdraws the Minor from future activities.$doc$,
  $doc$[Spanish translation pending attorney-reviewed English text. Contact paowtx@gmail.com for this document in Spanish.]$doc$,
  true
from doc
on conflict (document_id, version) do update set
  body_md = excluded.body_md, body_md_es = excluded.body_md_es, is_current = true;

-- ---------------------------------------------------------------------------
-- code-of-conduct
-- ---------------------------------------------------------------------------

insert into public.legal_documents (slug, title, title_es, kind, required, minors_only, sort_order)
values ($doc$code-of-conduct$doc$, $doc$Volunteer Code of Conduct$doc$, $doc$Código de Conducta del Voluntario$doc$, $doc$code_of_conduct$doc$, true, false, 60)
on conflict (slug) do update set
  title = excluded.title, title_es = excluded.title_es, kind = excluded.kind,
  minors_only = excluded.minors_only, sort_order = excluded.sort_order;

with doc as (
  select id from public.legal_documents where slug = $doc$code-of-conduct$doc$
)
insert into public.legal_document_versions (document_id, version, effective_from, body_md, body_md_es, is_current)
select doc.id, '1.0', current_date,
  $doc$**Peace Academy of West Texas** — 3411 Brentwood Drive, Odessa, Texas 79762.

> **Draft — not for use until reviewed by a Texas-licensed attorney.**
> Section 4 states a legal duty that applies to every volunteer personally.

The Organization brings together people of many cultures, faiths and
backgrounds. That is the work, not a side effect of it. This code exists so that
everyone who walks into a PAWTX event knows what to expect from the people
running it.

---

## 1. Respect

- Treat participants, families, other volunteers and staff with courtesy,
  whatever their race, national origin, religion, language, immigration status,
  sex, sexual orientation, gender identity, age, disability or politics.
- Do not proselytise. Volunteers do not use PAWTX activities to promote a
  religious or political position, or to recruit for any group.
- Ask before you assume. People's names, pronouns, dietary needs and customs are
  theirs to tell you.
- Harassment of any kind — verbal, physical, sexual, or online — ends a
  volunteer's involvement.

## 2. Safety

- Follow your supervisor's safety instructions, and stop and ask if something
  looks unsafe.
- Report every accident, injury, near-miss and instance of property damage to
  your supervisor **the same day**, even where nobody was hurt.
- Do not lift beyond what you can manage safely. Ask for help.
- Outdoor events in West Texas get dangerously hot. Drink water, use shade, and
  tell someone if you or anyone else shows signs of heat illness.
- Do not volunteer while impaired by alcohol or drugs.

## 3. Working with children and vulnerable adults

These are not suggestions. They are the conditions of working with minors.

- **Stay in sight.** Do not be alone with a child who is not your own where you
  cannot be observed. Two adults, or a place others can see, always.
- **No private contact.** Do not contact a minor participant privately by phone,
  text, social media or messaging app. Communication goes through the
  Organization or the parent.
- **No transport alone**, and none at all without written parental
  authorisation.
- **No photographs on personal devices**, and none published anywhere without
  the consent recorded under `04-media-consent.md`.
- **No physical discipline**, and no physical contact beyond what is ordinary,
  brief and in view of others.
- **No gifts** to an individual child outside a programme.

## 4. Reporting suspected abuse — this is the law, and it is personal to you

**Texas Family Code §261.101 requires any person who suspects that a child has
been abused or neglected to report it within 48 hours. This duty is yours
personally. It cannot be satisfied by telling a supervisor and leaving it
there, and it is not limited to professionals.**

- Texas Abuse Hotline: **1-800-252-5400**, or <https://www.txabusehotline.org>.
- Where a child is in immediate danger, call **911** first.
- Also tell the Organization's designated contact so it can act — but **the
  report to the state is yours to make**, and telling the Organization does not
  discharge it.
- Do not investigate. Do not interview the child. Do not confront the person
  suspected. Write down what you saw and heard, in the words used, as soon as
  you can.
- Failing to report is a criminal offence in Texas.

## 5. Confidentiality

What you learn about a participant, a family receiving assistance, a donor or
another volunteer stays inside the Organization. Do not repeat it, and do not
post about it. This continues after you stop volunteering. Where you are unsure,
treat it as confidential and ask.

## 6. Representing the Organization

- Do not speak to the press on the Organization's behalf. Refer enquiries to
  staff.
- Do not post on social media as though you speak for PAWTX. Sharing what you
  did as a volunteer is welcome; speaking for the Organization is not.
- Do not sign anything, order anything or make a commitment in the
  Organization's name without written authorisation.

## 7. Money and property

- Do not accept cash donations personally. Direct donors to the Organization.
- Use PAWTX property and supplies for PAWTX purposes only.
- Declare any conflict of interest — a family business bidding for work, for
  example — to your supervisor before it becomes a problem.

## 8. If something goes wrong

Raise it with your supervisor. If the concern is about your supervisor, or you
would rather not go to them, write to **paowtx@gmail.com**.

Nobody will be penalised for raising a concern honestly and in good faith. The
Organization will not retaliate against a volunteer for making a report,
including a report under section 4.

## 9. Consequences

Breach of this code may lead to a conversation, to removal from an activity, or
to the end of the volunteer relationship — the response fits what happened.
Conduct that puts a child or vulnerable adult at risk, and harassment, end the
relationship immediately and may be reported to the authorities.$doc$,
  $doc$[Spanish translation pending attorney-reviewed English text. Contact paowtx@gmail.com for this document in Spanish.]$doc$,
  true
from doc
on conflict (document_id, version) do update set
  body_md = excluded.body_md, body_md_es = excluded.body_md_es, is_current = true;

-- ============================================================
-- ФАЙЛ: supabase/migrations/20260727170000_fix_application_review_grant.sql
-- ============================================================

-- Fix: admins could not actually review an application.
--
-- The previous migration revoked table-wide UPDATE on volunteer_applications
-- and granted back only the columns an applicant edits about themselves
-- (phone, address, emergency contact, and so on) — modelled on the same
-- pattern used for profiles.role and shifts.spots_filled. But those two
-- precedents are cases where NO ONE should touch the column through the app,
-- admins included. This is not that case: the "applications: admins manage"
-- row policy exists specifically so an admin CAN set status, reviewed_by,
-- reviewed_at and review_note.
--
-- Column GRANTs and row-level policies are separate gates, and both must
-- pass. There is no separate Postgres role for "admin" — an admin connects
-- as `authenticated` exactly like an applicant, distinguished only by the
-- `is_admin()` check inside the row policy. Leaving the review columns out
-- of the GRANT blocked the operation for the whole `authenticated` role
-- before the row policy was ever consulted, which silently disabled review
-- for every admin, not just for applicants.
--
-- This is safe to add back: a non-admin attempting the same UPDATE still
-- matches zero rows under the "admins manage" USING clause (their only
-- other policies are "read own", for SELECT, and "submit own", for INSERT),
-- so widening the column grant does not widen who can act — only whether an
-- admin who already clears the row policy is also allowed to touch the
-- column.

grant update (status, reviewed_by, reviewed_at, review_note)
  on public.volunteer_applications to authenticated;

-- ============================================================
-- ФАЙЛ: supabase/migrations/20260727180000_document_signature_choice.sql
-- ============================================================

-- Add somewhere to record a signer's actual choice, not just that they signed.
--
-- Every document but one is a plain "read it, agree, sign" — a signature row
-- proves the whole story. 04-media-consent.md is not: it offers three
-- outcomes (full consent, photographs only, or decline), and declining is
-- meant to be a completely normal, unpenalised choice — not something the
-- signing flow can only represent as "no row exists". Without a place to
-- store which of the three was picked, a signature on this document would
-- prove someone read it and nothing about what they decided.
--
-- Nullable and unused by the other five documents, where the choice really
-- is binary and the existence of the row already says "agreed".

alter table public.document_signatures
  add column if not exists choice text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.document_signatures'::regclass
       and conname = 'document_signatures_choice_check'
  ) then
    alter table public.document_signatures
      add constraint document_signatures_choice_check
      check (choice in ('yes', 'photos_only', 'no'));
  end if;
end $$;

comment on column public.document_signatures.choice is
  'Only meaningful for a signature on the media-consent document. Null for every other document — the row existing is the whole answer there.';

-- ============================================================
-- ФАЙЛ: supabase/migrations/20260728005049_seed_legal_documents.sql
-- ============================================================

-- Generated by scripts/generate-legal-seed.mjs from legal/*.md. Do not hand-edit —
-- regenerate instead, or this file and the drafts it came from will drift apart.
--
-- Idempotent: safe to paste into the SQL editor twice. NOT idempotent across a
-- version bump being re-run with yet another text change under the same version
-- string — bump the version in this script again first. Real volunteers/guardians
-- may already have signed the version being superseded here, and their
-- document_signatures.body_hash is a snapshot of exactly what they saw: this
-- migration retires the old version (is_current = false, left untouched otherwise)
-- and inserts the new text as a new version row, rather than overwriting the old
-- version's body_md in place. Overwriting in place would silently rewrite, under
-- an already-signed version_id, the text a past signer's hash was computed
-- against — exactly what the hash exists to prevent. Past signers keep reading
-- their own version via the "document_versions: read own signed" policy.
--
-- The English body still carries "Draft — not for use until reviewed by a
-- Texas-licensed attorney" on purpose. It is the guardrail that stops this
-- from being put in front of a real volunteer or a real parent before that
-- review has happened — see legal/README.md. Remove that sentence from the
-- markdown (and regenerate) only once counsel has signed off.

-- ---------------------------------------------------------------------------
-- volunteer-application  (version 1.0)
-- ---------------------------------------------------------------------------

insert into public.legal_documents (slug, title, title_es, kind, required, minors_only, sort_order)
values ($doc$volunteer-application$doc$, $doc$Volunteer Application$doc$, $doc$Solicitud de Voluntariado$doc$, $doc$application$doc$, true, false, 10)
on conflict (slug) do update set
  title = excluded.title, title_es = excluded.title_es, kind = excluded.kind,
  minors_only = excluded.minors_only, sort_order = excluded.sort_order;

with doc as (
  select id from public.legal_documents where slug = $doc$volunteer-application$doc$
)
update public.legal_document_versions set is_current = false
where document_id = (select id from doc)
  and version <> $doc$1.0$doc$
  and is_current;

with doc as (
  select id from public.legal_documents where slug = $doc$volunteer-application$doc$
)
insert into public.legal_document_versions (document_id, version, effective_from, body_md, body_md_es, is_current)
select doc.id, $doc$1.0$doc$, current_date,
  $doc$**Peace Academy of West Texas** — 3411 Brentwood Drive, Odessa, Texas 79762.

> **Draft — not for use until reviewed by a Texas-licensed attorney.**
>
> This is the field specification for the application form, and the notices
> that must appear on it. The fields map to `public.volunteer_applications`.

---

## Notice shown at the top of the form

> We ask for this information to place you in a role that suits you, to reach
> you about shifts, and to contact someone on your behalf if you are hurt while
> volunteering. **We do not sell it, and we do not share it outside Peace
> Academy of West Texas** except where the law requires.
>
> Applying does not commit you to anything. Nothing is scheduled until you
> choose a shift.

## Fields

### About you

| Field | Required | Notes |
|---|---|---|
| Full legal name | yes | As it should appear on a certificate of service |
| Email | yes | Also the sign-in address |
| Phone | no | |
| Date of birth | yes | Determines whether guardian consent is required. **Not** used for eligibility beyond that |
| Street address, city, state, ZIP | no | Asked because some grant reporting is by county |
| Preferred language | no | English / Spanish / other |

**Minimum age for self-registration is 13.** Someone younger is enrolled by a
parent, who completes the form on their behalf. This keeps the portal clear of
the verifiable-parental-consent obligations that COPPA attaches to collecting
personal information online from a child under 13.

### Emergency contact

| Field | Required |
|---|---|
| Name | yes |
| Phone | yes |
| Relationship to you | no |

Stated on the form: *"We will only use this if you are hurt or taken ill while
volunteering and we cannot reach you."*

### What you would like to do

| Field | Required | Notes |
|---|---|---|
| Areas of interest | no | Multi-select from the six volunteer roles |
| Skills and experience | no | Free text — languages spoken, food handling, first aid, driving, trades |
| Availability | no | Free text or day/time grid |
| Interested in youth programmes | no | Checkbox. **Screening applies before any unsupervised contact with minors — see the note below** |
| Why you would like to volunteer | no | Free text |

### What is deliberately not asked

- **Criminal history.** Not on the general application. Screening, where it is
  required, is a separate step with its own authorisation and its own FCRA
  obligations if a consumer reporting agency is used. Asking everyone on the
  first form is both unnecessary and a legal exposure of its own.
- **Immigration or citizenship status.** Irrelevant to volunteering and not the
  Organization's business.
- **Health conditions.** Only what someone chooses to disclose so their role can
  be made safe. Do not ask for a medical history.
- **Social security number.** Never, for a volunteer.

## Notice shown above the submit button

> Submitting this application does not make you a volunteer. We will review it
> and get in touch. Before your first shift you will be asked to read and sign
> the Volunteer Agreement, the Release and Waiver, and the Code of Conduct.
> Photo consent is separate, and optional.

## After submission

Status moves through `submitted → in_review → approved | declined`. A volunteer
may withdraw at any time (`withdrawn`).

Retention: **to be set by the attorney.** Applications, dates of birth and
emergency contacts should not be kept indefinitely, and nothing in the schema
purges them today.$doc$,
  $doc$[Spanish translation pending attorney-reviewed English text. Contact paowtx@gmail.com for this document in Spanish.]$doc$,
  true
from doc
on conflict (document_id, version) do update set
  body_md = excluded.body_md, body_md_es = excluded.body_md_es, is_current = true;

-- ---------------------------------------------------------------------------
-- volunteer-agreement  (version 1.1)
-- ---------------------------------------------------------------------------

insert into public.legal_documents (slug, title, title_es, kind, required, minors_only, sort_order)
values ($doc$volunteer-agreement$doc$, $doc$Volunteer Agreement$doc$, $doc$Acuerdo de Voluntariado$doc$, $doc$agreement$doc$, true, false, 20)
on conflict (slug) do update set
  title = excluded.title, title_es = excluded.title_es, kind = excluded.kind,
  minors_only = excluded.minors_only, sort_order = excluded.sort_order;

with doc as (
  select id from public.legal_documents where slug = $doc$volunteer-agreement$doc$
)
update public.legal_document_versions set is_current = false
where document_id = (select id from doc)
  and version <> $doc$1.1$doc$
  and is_current;

with doc as (
  select id from public.legal_documents where slug = $doc$volunteer-agreement$doc$
)
insert into public.legal_document_versions (document_id, version, effective_from, body_md, body_md_es, is_current)
select doc.id, $doc$1.1$doc$, current_date,
  $doc$**Peace Academy of West Texas** — 3411 Brentwood Drive, Odessa, Texas 79762.

> **Draft — not for use until reviewed by a Texas-licensed attorney.**

This agreement sets out what the Organization asks of its volunteers and what
volunteers can expect in return. It is not an employment contract.

---

## 1. Volunteer status

I am serving as a volunteer. I understand and agree that:

- **I am not an employee** of the Organization, and this agreement creates no
  employment relationship, no contract of employment, and no expectation of
  continued service.
- **I serve without compensation.** I am not entitled to wages, salary, stipend,
  or any other payment for my time, and I am not volunteering in the expectation
  of future paid work.
- I am not covered by the Organization's workers' compensation insurance (if
  any), nor by health, disability or accident insurance provided by it.
- Volunteer work will not displace a paid employee or duplicate work the
  Organization pays someone else to do.

The Organization may reimburse pre-approved out-of-pocket expenses. Any
reimbursement requires a receipt and prior approval, and is a reimbursement of
cost rather than payment for time.

## 2. What the Organization commits to

- To tell me what a role involves before I take it on, and to provide the
  orientation and training that role needs.
- To provide a named supervisor for each activity and a way to reach them.
- To treat me with respect, and to apply its non-discrimination and
  anti-harassment commitments to volunteers as it does to staff.
- To keep the personal information I provide confidential, and to use it only to
  run its volunteer programme.
- To keep an accurate record of the hours I serve, and to provide a certificate
  of service on request.

## 3. What I commit to

- To arrive when I have said I will, and to give as much notice as I can when I
  cannot — a shift left unfilled is usually a service that does not happen.
- To follow the Code of Conduct, which I have read.
- To follow the reasonable instructions of my supervisor, and safety rules in
  particular.
- To work within the role I have been given, and to ask before doing anything
  outside it. I will not represent myself as speaking for the Organization, or
  make commitments on its behalf, without written authorisation.
- To report accidents, injuries, near-misses and property damage to my
  supervisor **the same day**.
- Not to volunteer while under the influence of alcohol or of any drug that
  impairs my ability to serve safely.

## 4. Confidentiality

In the course of volunteering I may learn personal information about
programme participants, donors, other volunteers, or families receiving
assistance. **I will not disclose it to anyone outside the Organization, and I
will not use it for any purpose of my own.** This obligation continues after I
stop volunteering. If I am unsure whether something is confidential, I will
treat it as if it is and ask my supervisor.

## 5. Hours and records

Hours are credited by staff after an activity, on the basis of attendance
actually observed. Signing up for a shift is not the same as serving it. I may
view my recorded hours at any time in the volunteer portal, and I will raise any
discrepancy promptly, while it can still be checked.

## 6. Media

Photography and video consent is given separately, in the Photo and Media
Consent document. It is optional, and declining it does not affect my ability
to volunteer.

## 7. Ending the arrangement

Either of us may end this arrangement at any time, with or without reason and
without notice. The Organization may also suspend or remove me from an activity
immediately where it believes there is a risk to a participant, another
volunteer, or the Organization. Sections 4 (Confidentiality) and any obligation
under the Release, Waiver of Liability, and Assumption of Risk survive.

## 8. Equal opportunity

The Organization welcomes volunteers without regard to race, colour, national
origin, ancestry, religion, sex, sexual orientation, gender identity, age,
disability, veteran status, or any other characteristic protected by law. I may
ask for a reasonable accommodation at any time by writing to paowtx@gmail.com,
and doing so will not count against me.

## 9. General

This agreement is governed by Texas law. It replaces any prior understanding
about my volunteer service. If any part is unenforceable, the rest stands.$doc$,
  $doc$[Spanish translation pending attorney-reviewed English text. Contact paowtx@gmail.com for this document in Spanish.]$doc$,
  true
from doc
on conflict (document_id, version) do update set
  body_md = excluded.body_md, body_md_es = excluded.body_md_es, is_current = true;

-- ---------------------------------------------------------------------------
-- release-and-waiver  (version 1.1)
-- ---------------------------------------------------------------------------

insert into public.legal_documents (slug, title, title_es, kind, required, minors_only, sort_order)
values ($doc$release-and-waiver$doc$, $doc$Release, Waiver of Liability, and Assumption of Risk$doc$, $doc$Exención de Responsabilidad y Aceptación de Riesgos$doc$, $doc$release$doc$, true, false, 30)
on conflict (slug) do update set
  title = excluded.title, title_es = excluded.title_es, kind = excluded.kind,
  minors_only = excluded.minors_only, sort_order = excluded.sort_order;

with doc as (
  select id from public.legal_documents where slug = $doc$release-and-waiver$doc$
)
update public.legal_document_versions set is_current = false
where document_id = (select id from doc)
  and version <> $doc$1.1$doc$
  and is_current;

with doc as (
  select id from public.legal_documents where slug = $doc$release-and-waiver$doc$
)
insert into public.legal_document_versions (document_id, version, effective_from, body_md, body_md_es, is_current)
select doc.id, $doc$1.1$doc$, current_date,
  $doc$**Peace Academy of West Texas** — a Texas non-profit corporation, 3411 Brentwood
Drive, Odessa, Texas 79762 (the "Organization").

> **Draft — not for use until reviewed by a Texas-licensed attorney.** If the
> signer is under 18, this document is signed by the volunteer *and* by a
> parent or guardian under the Parent/Guardian Consent document, and the
> limits described there apply.

**Read this before signing. It affects your legal rights.**

---

## 1. Activities covered

I am volunteering with the Organization. My activities may include, without
limitation: preparing and serving food; setting up, running and dismantling
events indoors and outdoors; lifting and carrying supplies; assembling and
distributing relief packages; greeting and assisting the public; interpreting
and translating; supporting youth and sports programming; and travelling
between sites (together, the "Activities").

## 2. Assumption of risk

I understand that the Activities carry risks that cannot be eliminated, however
carefully the Organization conducts them. These include, without limitation:
slips, trips and falls; cuts, burns and injuries from kitchen equipment and hand
tools; strains and crush injuries from lifting or moving heavy objects; heat
exhaustion, heat stroke, sunburn and dehydration during outdoor events in West
Texas; allergic reactions, including to foods and cleaning products;
communicable illness; injury caused by other volunteers, participants, members
of the public, or animals; property damage or loss; and the risks of travelling
to and from sites, including motor vehicle collisions.

I understand this list is not complete, and that there may be risks not now
foreseeable. **I knowingly and voluntarily accept these risks** and choose to
participate anyway.

## 3. Fitness and medical care

I represent that I am physically able to perform the Activities I take on, and
that I will tell my supervisor about any condition, allergy, or limitation that
could affect my safety or anyone else's. I authorise the Organization to obtain
emergency medical care for me if I am unable to consent, and I accept financial
responsibility for that care. I understand **the Organization does not provide
health, medical, disability or workers' compensation insurance for volunteers**
and that I am responsible for my own coverage.

## 4. Release of claims

> ### ⚠ READ THIS PARAGRAPH CAREFULLY. IT RELEASES CLAIMS FOR THE ORGANIZATION'S OWN NEGLIGENCE.
>
> **IN EXCHANGE FOR BEING PERMITTED TO VOLUNTEER, I RELEASE, WAIVE AND DISCHARGE
> PEACE ACADEMY OF WEST TEXAS, ITS DIRECTORS, OFFICERS, EMPLOYEES, AGENTS,
> VOLUNTEERS AND PROPERTY OWNERS WHOSE PREMISES ARE USED (THE "RELEASED
> PARTIES") FROM ALL LIABILITY, CLAIMS, DEMANDS AND CAUSES OF ACTION FOR ANY
> INJURY, DEATH, ILLNESS, OR LOSS OF OR DAMAGE TO PROPERTY THAT I SUFFER
> ARISING OUT OF THE ACTIVITIES — INCLUDING ANY SUCH INJURY, DEATH, ILLNESS,
> LOSS OR DAMAGE CAUSED IN WHOLE OR IN PART BY THE ORDINARY NEGLIGENCE OF ANY
> OF THE RELEASED PARTIES.**
>
> **I UNDERSTAND THAT I AM GIVING UP SUBSTANTIAL RIGHTS, INCLUDING MY RIGHT TO
> SUE THE RELEASED PARTIES FOR THEIR OWN NEGLIGENCE.**

This release does **not** apply to gross negligence, wilful or wanton
misconduct, intentional wrongdoing, or any liability that Texas law does not
permit to be released.

## 5. Indemnity

I agree to indemnify and hold the Released Parties harmless from any claim
brought by a third party arising out of my own negligent or wrongful act or
omission during the Activities. This does not require me to indemnify a
Released Party against that party's own negligence.

## 6. Statutory protections preserved

Nothing in this document waives or limits any protection available to the
Organization or to volunteers under the Texas Charitable Immunity and Liability
Act (Tex. Civ. Prac. & Rem. Code ch. 84) or the federal Volunteer Protection
Act of 1997 (42 U.S.C. §14501 et seq.).

## 7. General

This document is governed by the laws of the State of Texas, without regard to
conflict-of-laws rules. Venue for any dispute lies in Ector County, Texas. If
any part is held unenforceable, the rest remains in force, and the
unenforceable part is to be given the narrowest reading that is enforceable.
This release binds my heirs, personal representatives and assigns.

I have read this document in full. **I understand it is a release of liability
and a contract, and I sign it freely.** No one has told me it is merely a
formality.$doc$,
  $doc$[Spanish translation pending attorney-reviewed English text. Contact paowtx@gmail.com for this document in Spanish.]$doc$,
  true
from doc
on conflict (document_id, version) do update set
  body_md = excluded.body_md, body_md_es = excluded.body_md_es, is_current = true;

-- ---------------------------------------------------------------------------
-- media-consent  (version 1.1)
-- ---------------------------------------------------------------------------

insert into public.legal_documents (slug, title, title_es, kind, required, minors_only, sort_order)
values ($doc$media-consent$doc$, $doc$Photo and Media Consent$doc$, $doc$Consentimiento de Fotografía y Medios$doc$, $doc$media_consent$doc$, true, false, 40)
on conflict (slug) do update set
  title = excluded.title, title_es = excluded.title_es, kind = excluded.kind,
  minors_only = excluded.minors_only, sort_order = excluded.sort_order;

with doc as (
  select id from public.legal_documents where slug = $doc$media-consent$doc$
)
update public.legal_document_versions set is_current = false
where document_id = (select id from doc)
  and version <> $doc$1.1$doc$
  and is_current;

with doc as (
  select id from public.legal_documents where slug = $doc$media-consent$doc$
)
insert into public.legal_document_versions (document_id, version, effective_from, body_md, body_md_es, is_current)
select doc.id, $doc$1.1$doc$, current_date,
  $doc$**Peace Academy of West Texas** — 3411 Brentwood Drive, Odessa, Texas 79762.

> **Draft — not for use until reviewed by a Texas-licensed attorney.**
>
> **This consent is optional.** Declining it must not affect anyone's ability to
> volunteer or to take part in a programme, and the onboarding flow is built so
> that "no" is a normal outcome rather than a blocked path.

---

## 1. What is being asked

The Organization photographs and films its events — cooking classes, cultural
festivals, relief drives, seminars — and uses the results to show what it does
and to raise support. This form asks whether your image may be included.

## 2. What you are consenting to, if you say yes

Permission for the Organization to record my image, likeness, voice and first
name at its activities, and to reproduce, publish and distribute those
recordings:

- on the PAWTX website and its social media accounts;
- in printed material such as brochures, flyers, newsletters and annual reports;
- in grant applications and reports to funders;
- in local press coverage of PAWTX activities.

This permission is granted worldwide, without a time limit except as described
in section 5, and without payment. I understand the Organization may crop, edit
or caption the material, and I waive any right to inspect or approve a
particular use in advance.

## 3. What is not being asked for

The Organization will **not**:

- publish my surname, address, telephone number or email alongside my image;
- publish my image in a way that suggests I endorse a commercial product, a
  political candidate, or a religious position;
- sell or license my image to a third party for their own advertising;
- publish an image of a minor without the consent recorded under the
  Parent/Guardian Consent document.

## 4. Choose one

- ☐ **Yes** — I consent as described above.
- ☐ **Photographs only** — I consent to still photography but not to video or
  audio recording.
- ☐ **No** — I do not consent. Please do not include me in photographs or
  recordings intended for publication.

If you choose "No", tell the person with the camera at an event as well.
Consent recorded here is honoured by staff, but a volunteer photographer at a
crowded festival cannot check a list in the moment.

## 5. Withdrawing consent

I may withdraw this consent at any time by writing to **paowtx@gmail.com**.

**Withdrawal applies going forward.** On withdrawal the Organization will,
within 30 days, stop using my image in new material and remove it from the
website and from social media accounts it controls where it can reasonably be
identified. It **cannot** recall material already printed and distributed, or
copies already shared or reposted by others, and it does not undertake to do
so. Archived material held for the Organization's own records may be retained.

## 6. Minors

Where the person recorded is under 18, this consent has no effect unless a
parent or guardian has signed the Parent/Guardian Consent document. **For
minors the default is no.**$doc$,
  $doc$[Spanish translation pending attorney-reviewed English text. Contact paowtx@gmail.com for this document in Spanish.]$doc$,
  true
from doc
on conflict (document_id, version) do update set
  body_md = excluded.body_md, body_md_es = excluded.body_md_es, is_current = true;

-- ---------------------------------------------------------------------------
-- guardian-consent  (version 1.1)
-- ---------------------------------------------------------------------------

insert into public.legal_documents (slug, title, title_es, kind, required, minors_only, sort_order)
values ($doc$guardian-consent$doc$, $doc$Parent / Guardian Consent for a Volunteer Under 18$doc$, $doc$Consentimiento de Padre/Tutor para un Voluntario Menor de 18$doc$, $doc$guardian_consent$doc$, true, true, 50)
on conflict (slug) do update set
  title = excluded.title, title_es = excluded.title_es, kind = excluded.kind,
  minors_only = excluded.minors_only, sort_order = excluded.sort_order;

with doc as (
  select id from public.legal_documents where slug = $doc$guardian-consent$doc$
)
update public.legal_document_versions set is_current = false
where document_id = (select id from doc)
  and version <> $doc$1.1$doc$
  and is_current;

with doc as (
  select id from public.legal_documents where slug = $doc$guardian-consent$doc$
)
insert into public.legal_document_versions (document_id, version, effective_from, body_md, body_md_es, is_current)
select doc.id, $doc$1.1$doc$, current_date,
  $doc$**Peace Academy of West Texas** — 3411 Brentwood Drive, Odessa, Texas 79762.

> **Draft — not for use until reviewed by a Texas-licensed attorney.**
>
> **Read this note before adapting the document.** It is deliberately *not*
> drafted as a waiver of the minor's claims. Under *Munoz v. II Jaz Inc.*,
> 863 S.W.2d 207 (Tex. App.—Houston [14th Dist.] 1993), a parent's authority
> over a child does not extend to releasing the child's own cause of action,
> and a clause purporting to do so is very likely unenforceable in Texas.
>
> Adding one would not make the Organization safer. It would add a clause a
> court strikes, and invite the argument that the document as a whole was
> written to overreach. What protects minors here is insurance, supervision
> and screening — not paperwork.

---

I am the parent or legal guardian of the minor named below (the "Minor"), and I
have the legal authority to make this decision for them.

## 1. Consent to participate

I consent to the Minor volunteering with the Organization and taking part in its
activities, which may include preparing and serving food, setting up and running
indoor and outdoor events, assembling and distributing relief packages,
assisting the public, and supporting youth and sports programming.

I understand the Minor will be supervised by Organization staff or approved
adult volunteers, and I have discussed the Code of Conduct with them.

## 2. Acknowledgement of risk

I have read the description of risks in the Release and Waiver and I
understand them. They include, among others,
injuries from kitchen equipment and hand tools, lifting injuries, heat illness
during outdoor events in West Texas, allergic reactions, communicable illness,
and injury caused by other people present.

**I accept that these risks exist and I consent to the Minor's participation
with that understanding.**

## 3. Transportation

Please indicate one:

- ☐ The Minor will be brought to and collected from activities by me or by an
  adult I authorise.
- ☐ I authorise the Organization to transport the Minor in a vehicle driven by
  a screened adult volunteer or staff member.
- ☐ I authorise the Minor to travel to and from activities independently.

## 4. Emergency medical authorisation

If the Minor is injured or becomes ill and I cannot be reached in time, I
authorise the Organization to seek emergency medical treatment for them,
including transport by ambulance. I accept financial responsibility for that
treatment. I understand **the Organization does not provide medical or accident
insurance for volunteers.**

- Known allergies, conditions, or medications: `_______________`
- Health insurance carrier and policy number (optional): `_______________`

## 5. Release of my own claims, and indemnity

**This section releases my own claims. It does not release, and does not
purport to release, any claim belonging to the Minor.**

To the extent permitted by Texas law, I release the Organization, its
directors, officers, employees, agents and volunteers from claims **that I
personally** may have arising out of the Minor's participation, including
claims for my own loss of the Minor's services or companionship and for
expenses I incur — **including where such a claim arises in whole or in part
from the ordinary negligence of the Organization.** This does not extend to
gross negligence, wilful or wanton misconduct, or intentional wrongdoing.

I agree to indemnify the Organization against claims brought by a third party
arising from the Minor's own wrongful act.

## 6. Media

Consent to photography and video of the Minor is given separately, in the
Photo and Media Consent document, and may be declined without affecting the
Minor's ability to volunteer. **Consent for a minor is off by default and
requires this signature.**

## 7. Communication

The Organization will send scheduling messages to me as well as to the Minor. I
may withdraw this consent at any time by writing to paowtx@gmail.com, which
also withdraws the Minor from future activities.$doc$,
  $doc$[Spanish translation pending attorney-reviewed English text. Contact paowtx@gmail.com for this document in Spanish.]$doc$,
  true
from doc
on conflict (document_id, version) do update set
  body_md = excluded.body_md, body_md_es = excluded.body_md_es, is_current = true;

-- ---------------------------------------------------------------------------
-- code-of-conduct  (version 1.1)
-- ---------------------------------------------------------------------------

insert into public.legal_documents (slug, title, title_es, kind, required, minors_only, sort_order)
values ($doc$code-of-conduct$doc$, $doc$Volunteer Code of Conduct$doc$, $doc$Código de Conducta del Voluntario$doc$, $doc$code_of_conduct$doc$, true, false, 60)
on conflict (slug) do update set
  title = excluded.title, title_es = excluded.title_es, kind = excluded.kind,
  minors_only = excluded.minors_only, sort_order = excluded.sort_order;

with doc as (
  select id from public.legal_documents where slug = $doc$code-of-conduct$doc$
)
update public.legal_document_versions set is_current = false
where document_id = (select id from doc)
  and version <> $doc$1.1$doc$
  and is_current;

with doc as (
  select id from public.legal_documents where slug = $doc$code-of-conduct$doc$
)
insert into public.legal_document_versions (document_id, version, effective_from, body_md, body_md_es, is_current)
select doc.id, $doc$1.1$doc$, current_date,
  $doc$**Peace Academy of West Texas** — 3411 Brentwood Drive, Odessa, Texas 79762.

> **Draft — not for use until reviewed by a Texas-licensed attorney.**
> Section 4 states a legal duty that applies to every volunteer personally.

The Organization brings together people of many cultures, faiths and
backgrounds. That is the work, not a side effect of it. This code exists so that
everyone who walks into a PAWTX event knows what to expect from the people
running it.

---

## 1. Respect

- Treat participants, families, other volunteers and staff with courtesy,
  whatever their race, national origin, religion, language, immigration status,
  sex, sexual orientation, gender identity, age, disability or politics.
- Do not proselytise. Volunteers do not use PAWTX activities to promote a
  religious or political position, or to recruit for any group.
- Ask before you assume. People's names, pronouns, dietary needs and customs are
  theirs to tell you.
- Harassment of any kind — verbal, physical, sexual, or online — ends a
  volunteer's involvement.

## 2. Safety

- Follow your supervisor's safety instructions, and stop and ask if something
  looks unsafe.
- Report every accident, injury, near-miss and instance of property damage to
  your supervisor **the same day**, even where nobody was hurt.
- Do not lift beyond what you can manage safely. Ask for help.
- Outdoor events in West Texas get dangerously hot. Drink water, use shade, and
  tell someone if you or anyone else shows signs of heat illness.
- Do not volunteer while impaired by alcohol or drugs.

## 3. Working with children and vulnerable adults

These are not suggestions. They are the conditions of working with minors.

- **Stay in sight.** Do not be alone with a child who is not your own where you
  cannot be observed. Two adults, or a place others can see, always.
- **No private contact.** Do not contact a minor participant privately by phone,
  text, social media or messaging app. Communication goes through the
  Organization or the parent.
- **No transport alone**, and none at all without written parental
  authorisation.
- **No photographs on personal devices**, and none published anywhere without
  the consent recorded under the Photo and Media Consent document.
- **No physical discipline**, and no physical contact beyond what is ordinary,
  brief and in view of others.
- **No gifts** to an individual child outside a programme.

## 4. Reporting suspected abuse — this is the law, and it is personal to you

**Texas Family Code §261.101 requires any person who suspects that a child has
been abused or neglected to report it within 48 hours. This duty is yours
personally. It cannot be satisfied by telling a supervisor and leaving it
there, and it is not limited to professionals.**

- Texas Abuse Hotline: **1-800-252-5400**, or <https://www.txabusehotline.org>.
- Where a child is in immediate danger, call **911** first.
- Also tell the Organization's designated contact so it can act — but **the
  report to the state is yours to make**, and telling the Organization does not
  discharge it.
- Do not investigate. Do not interview the child. Do not confront the person
  suspected. Write down what you saw and heard, in the words used, as soon as
  you can.
- Failing to report is a criminal offence in Texas.

## 5. Confidentiality

What you learn about a participant, a family receiving assistance, a donor or
another volunteer stays inside the Organization. Do not repeat it, and do not
post about it. This continues after you stop volunteering. Where you are unsure,
treat it as confidential and ask.

## 6. Representing the Organization

- Do not speak to the press on the Organization's behalf. Refer enquiries to
  staff.
- Do not post on social media as though you speak for PAWTX. Sharing what you
  did as a volunteer is welcome; speaking for the Organization is not.
- Do not sign anything, order anything or make a commitment in the
  Organization's name without written authorisation.

## 7. Money and property

- Do not accept cash donations personally. Direct donors to the Organization.
- Use PAWTX property and supplies for PAWTX purposes only.
- Declare any conflict of interest — a family business bidding for work, for
  example — to your supervisor before it becomes a problem.

## 8. If something goes wrong

Raise it with your supervisor. If the concern is about your supervisor, or you
would rather not go to them, write to **paowtx@gmail.com**.

Nobody will be penalised for raising a concern honestly and in good faith. The
Organization will not retaliate against a volunteer for making a report,
including a report under section 4.

## 9. Consequences

Breach of this code may lead to a conversation, to removal from an activity, or
to the end of the volunteer relationship — the response fits what happened.
Conduct that puts a child or vulnerable adult at risk, and harassment, end the
relationship immediately and may be reported to the authorities.$doc$,
  $doc$[Spanish translation pending attorney-reviewed English text. Contact paowtx@gmail.com for this document in Spanish.]$doc$,
  true
from doc
on conflict (document_id, version) do update set
  body_md = excluded.body_md, body_md_es = excluded.body_md_es, is_current = true;

-- ============================================================
-- ФАЙЛ: supabase/migrations/20260728100000_read_own_signed_version.sql
-- ============================================================

-- Let a signer read the exact version they signed, even after it stops
-- being current.
--
-- "document_versions: public read current" only allows a non-admin to read a
-- version where is_current is true. That is fine for someone about to sign
-- the document today, but it quietly breaks the other half of why versions
-- are hashed and kept at all: if the document is ever revised, every
-- volunteer who signed the OLD wording would lose the ability to read the
-- text they actually agreed to, the moment a new version is published. The
-- signature row and its body_hash would still prove what they signed, but
-- nobody could show it to them on screen.
--
-- This policy is additive (RLS OR-combines matching policies), so it changes
-- nothing about who can currently read the live text of a document — it only
-- ever widens access to a version this specific user has a document_signatures
-- row pointing at.

drop policy if exists "document_versions: read own signed" on public.legal_document_versions;

create policy "document_versions: read own signed"
  on public.legal_document_versions for select
  to authenticated
  using (
    exists (
      select 1 from public.document_signatures
       where document_signatures.version_id = legal_document_versions.id
         and document_signatures.user_id = auth.uid()
    )
  );

-- ============================================================
-- ФАЙЛ: supabase/migrations/20260728120000_rsvp_media_consent.sql
-- ============================================================

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

-- ============================================================
-- ФАЙЛ: supabase/migrations/20260822000000_reject_rsvp_for_ended_events.sql
-- ============================================================

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

-- ============================================================
-- ФАЙЛ: supabase/migrations/20260822010000_rsvp_language.sql
-- ============================================================

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

-- ============================================================
-- ФАЙЛ: supabase/seed.sql
-- ============================================================

-- PAWTX seed data — the former contents of src/data/mockData.ts.
--
-- Run automatically by `supabase db reset` locally. NOT run by `db push`, so
-- production is seeded once, deliberately, with `supabase db reset --linked`
-- or by pasting this into the SQL editor.
--
-- IDs are fixed rather than generated so reseeding is idempotent and so the
-- same rows can be referenced from shifts below.
--
-- `image_key` values index the IMAGES registry in src/data/mockData.ts, which
-- maps them to content-hashed bundled WebP files. Admin-uploaded photos will
-- instead populate `image_url`. See the header of the init migration.
--
-- Times are wall-clock Central (America/Chicago) — the timezone PAWTX
-- operates in — converted to timestamptz on insert.

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------

insert into public.events (
  id, title, title_es, description, description_es,
  starts_at, ends_at, location, category,
  total_spots, reserved_spots, image_key, status, featured
) values
(
  '11111111-0000-4000-8000-000000000001',
  'International Cooking Class: Authentic Rendang & Asian Flavors',
  'Clase Internacional de Cocina: Rendang Auténtico y Sabores Asiáticos',
  'Hands-on culinary workshop guided by local community chefs. Learn spice blending, authentic cooking techniques, and share a communal dinner.',
  'Taller culinario práctico guiado por chefs locales. Aprende combinación de especias, técnicas auténticas y comparte una cena comunitaria.',
  timestamp '2026-08-15 17:30' at time zone 'America/Chicago',
  timestamp '2026-08-15 20:30' at time zone 'America/Chicago',
  'Odessa Community Kitchen, 1200 N Texas Ave, Odessa, TX',
  'cooking', 20, 8, 'cookingClass', 'upcoming', true
),
(
  '11111111-0000-4000-8000-000000000002',
  'Ladies Coffee & Cultural Exchange Night',
  'Noche de Café y Intercambio Cultural para Mujeres',
  'A cozy evening for women of all backgrounds to meet, enjoy coffee & traditional pastries, and build lasting friendships in West Texas.',
  'Una acogedora velada para que mujeres de todos los orígenes se conozcan, disfruten de café y repostería tradicional, y creen amistades duraderas.',
  timestamp '2026-08-20 18:30' at time zone 'America/Chicago',
  timestamp '2026-08-20 20:30' at time zone 'America/Chicago',
  'Midland Community Center, 2000 W Wadley Ave, Midland, TX',
  'cultural', 25, 17, 'coffeeNight', 'upcoming', true
),
(
  -- Deliberately at capacity (150/150) so the "event full" path stays testable.
  '11111111-0000-4000-8000-000000000003',
  'West Texas International Heritage Parade & Festival',
  'Desfile y Festival Internacional de la Herencia del Oeste de Tejas',
  'Annual flagship celebration featuring cultural booths (Tajikistan, Kenya, Mexico, USA), traditional dance performances, parade, and global cuisine.',
  'Celebración anual principal con stands culturales (Tayikistán, Kenia, México, EE. UU.), bailes tradicionales, desfile y gastronomía global.',
  timestamp '2026-09-12 10:00' at time zone 'America/Chicago',
  timestamp '2026-09-12 16:00' at time zone 'America/Chicago',
  'Noel Heritage Plaza, Downtown Odessa, TX',
  'cultural', 150, 150, 'parade', 'upcoming', true
),
(
  '11111111-0000-4000-8000-000000000004',
  'Peace & Diversity Seminar: Building Bridges in West Texas',
  'Seminario de Paz y Diversidad: Construyendo Puentes en el Oeste de Tejas',
  'An interactive discussion on community integration, interfaith dialogue, and civil engagement hosted by West Texas educators and leaders.',
  'Una discusión interactiva sobre integración comunitaria, diálogo interfe y participación civil con educadores y líderes de Tejas.',
  timestamp '2026-09-22 18:00' at time zone 'America/Chicago',
  timestamp '2026-09-22 20:00' at time zone 'America/Chicago',
  'UT Permian Basin Lecture Hall, Odessa, TX',
  'seminars', 60, 35, 'seminar', 'upcoming', false
),
(
  '11111111-0000-4000-8000-000000000005',
  'Fall Family Food & Warm Clothing Emergency Relief Drive',
  'Campaña de Ayuda de Alimentos y Ropa de Invierno para Familias',
  'Community outreach drive collecting non-perishable goods, jackets, and emergency support boxes for West Texas families in need.',
  'Campaña de apoyo comunitario recolectando alimentos no perecederos, abrigos y cajas de ayuda para familias necesitadas.',
  timestamp '2026-10-03 09:00' at time zone 'America/Chicago',
  timestamp '2026-10-03 14:00' at time zone 'America/Chicago',
  'Peace Academy Volunteer Center, Midland, TX',
  'relief', 40, 12, 'reliefDrive', 'upcoming', false
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- gallery_items
-- ---------------------------------------------------------------------------

insert into public.gallery_items (
  id, title, title_es, caption, caption_es, category, image_key, taken_on, location, sort_order
) values
(
  '22222222-0000-4000-8000-000000000001',
  'Heritage Parade on the Green', 'Desfile de la Herencia en la Plaza',
  'Children and volunteers leading the West Texas International Heritage Parade with American and Texas state flags.',
  'Niños y voluntarios liderando el Desfile Internacional de la Herencia con banderas de EE. UU. y Tejas.',
  'cultural', 'parade', date '2025-10-01', 'Noel Heritage Plaza, Odessa, TX', 1
),
(
  '22222222-0000-4000-8000-000000000002',
  'Different Cultures, One Community', 'Diferentes Culturas, Una Sola Comunidad',
  'Diverse community volunteers coming together with handmade signs celebrating unity in diversity across Midland & Odessa.',
  'Voluntarios comunitarios reunidos con carteles hechos a mano celebrando la unidad en la diversidad.',
  'cultural', 'communitySign', date '2025-09-01', 'Midland Community Park, TX', 2
),
(
  '22222222-0000-4000-8000-000000000003',
  'Tajikistan Cultural Pavilion & Hospitality', 'Pabellón Cultural de Tayikistán y Hospitalidad',
  'Local Tajik-American family showcasing traditional embroidered tapestries, fresh tea, non-bread, and cultural heritage.',
  'Familia tayiko-americana exhibiendo bordados tradicionales, té fresco, pan artesanal y herencia cultural.',
  'cultural', 'tajikistanBooth', date '2025-10-01', 'Odessa Heritage Grounds, TX', 3
),
(
  '22222222-0000-4000-8000-000000000004',
  'Traditional Folk Costume Celebration', 'Celebración de Trajes Folclóricos Tradicionales',
  'Young participant wearing hand-embroidered Mexican folk dress and floral straw hat during the cultural dance showcase.',
  'Joven participante vistiendo un traje folclórico mexicano bordado a mano y sombrero de paja con flores.',
  'cultural', 'mexicanCostume', date '2025-10-01', 'Odessa, TX', 4
),
(
  '22222222-0000-4000-8000-000000000005',
  'India Cultural Pavilion', 'Pabellón Cultural de India',
  'Volunteers at the India booth share crafts and hospitality with festival visitors beneath a Taj Mahal backdrop.',
  'Voluntarios en el stand de India comparten artesanías y hospitalidad con los visitantes bajo un fondo del Taj Mahal.',
  'cultural', 'indiaBooth', date '2025-10-01', 'Noel Heritage Plaza, Odessa, TX', 5
),
(
  '22222222-0000-4000-8000-000000000006',
  'International Dumpling & Cooking Workshop', 'Taller de Cocina y Empanadas Internacionales',
  'Community members learning spice techniques and rolling dough in our monthly cooking workshop.',
  'Miembros comunitarios aprendiendo técnicas de especias y amasado en nuestro taller de cocina mensual.',
  'cooking', 'cookingClass', date '2025-11-01', 'Odessa Community Kitchen, TX', 6
),
(
  '22222222-0000-4000-8000-000000000007',
  'Nigeria Cultural Pavilion', 'Pabellón Cultural de Nigeria',
  'A Nigerian-American family shares traditional dress and heritage with festival visitors at the International Cultural Festival.',
  'Una familia nigeriano-americana comparte vestimenta tradicional y herencia cultural con los visitantes del Festival Cultural Internacional.',
  'cultural', 'nigeriaBooth', date '2025-10-01', 'Noel Heritage Plaza, Odessa, TX', 7
),
(
  '22222222-0000-4000-8000-000000000008',
  'Turkish Cultural Pavilion', 'Pabellón Cultural de Turquía',
  'Volunteers welcome guests to the Turkey booth, sharing flags, crafts, and traditions with the West Texas community.',
  'Voluntarios reciben a los visitantes en el stand de Turquía, compartiendo banderas, artesanías y tradiciones con la comunidad.',
  'cultural', 'turkeyBooth', date '2025-10-01', 'Noel Heritage Plaza, Odessa, TX', 8
),
(
  '22222222-0000-4000-8000-000000000009',
  'Jordan Cultural Pavilion', 'Pabellón Cultural de Jordania',
  'Guests sample traditional treats and tea at the Jordan booth during the International Cultural Festival.',
  'Los invitados prueban dulces y té tradicionales en el stand de Jordania durante el Festival Cultural Internacional.',
  'cultural', 'jordanBooth', date '2025-10-01', 'Noel Heritage Plaza, Odessa, TX', 9
),
(
  '22222222-0000-4000-8000-000000000010',
  'Germany Cultural Pavilion', 'Pabellón Cultural de Alemania',
  'Volunteers representing Germany welcome festival-goers beneath a Brandenburg Gate backdrop.',
  'Voluntarios representando a Alemania reciben a los asistentes del festival bajo un fondo de la Puerta de Brandeburgo.',
  'cultural', 'germanyBooth', date '2025-10-01', 'Noel Heritage Plaza, Odessa, TX', 10
),
(
  '22222222-0000-4000-8000-000000000011',
  'Cameroon & Peru Cultural Booths', 'Stands Culturales de Camerún y Perú',
  'A volunteer in traditional Cameroonian dress welcomes visitors alongside the neighboring Peru pavilion.',
  'Una voluntaria con vestimenta tradicional camerunesa recibe a los visitantes junto al pabellón vecino de Perú.',
  'cultural', 'cameroonPeruBooth', date '2025-10-01', 'Noel Heritage Plaza, Odessa, TX', 11
),
(
  '22222222-0000-4000-8000-000000000012',
  'Vietnam Food Pavilion', 'Pabellón Gastronómico de Vietnam',
  'Volunteers serve traditional dishes at the Vietnam booth, part of the festival''s global food showcase.',
  'Voluntarios sirven platillos tradicionales en el stand de Vietnam, parte de la muestra gastronómica global del festival.',
  'cooking', 'vietnamBooth', date '2025-10-01', 'Noel Heritage Plaza, Odessa, TX', 12
),
(
  '22222222-0000-4000-8000-000000000013',
  'Community Fire & Rescue Partnership', 'Asociación Comunitaria con Bomberos y Rescate',
  'Local firefighters join the festival grounds, strengthening ties between first responders and the community they serve.',
  'Bomberos locales se unen al festival, fortaleciendo los lazos entre los primeros respondientes y la comunidad a la que sirven.',
  'relief', 'firefightersGroup', date '2025-10-01', 'Noel Heritage Plaza, Odessa, TX', 13
),
(
  '22222222-0000-4000-8000-000000000014',
  'Native Heritage Dance Performance', 'Presentación de Danza de Herencia Nativa',
  'A dancer in traditional regalia performs for festival guests, honoring Native heritage as part of the cultural showcase.',
  'Un bailarín con atuendo tradicional se presenta ante los invitados del festival, honrando la herencia nativa como parte de la muestra cultural.',
  'cultural', 'nativeHeritageDance', date '2025-10-01', 'Noel Heritage Plaza, Odessa, TX', 14
),
(
  '22222222-0000-4000-8000-000000000015',
  'Different Cultures, One Community (Encore)', 'Diferentes Culturas, Una Sola Comunidad (Bis)',
  'Another group of volunteers and neighbors rally behind the festival''s signature message of unity in diversity.',
  'Otro grupo de voluntarios y vecinos se une en torno al mensaje distintivo del festival: la unidad en la diversidad.',
  'cultural', 'oneCommunityEncore', date '2025-10-01', 'Noel Heritage Plaza, Odessa, TX', 15
),
(
  '22222222-0000-4000-8000-000000000016',
  'Trying On Traditions Together', 'Probando Tradiciones Juntas',
  'Women from different backgrounds share and try on each other''s traditional dress during a community cultural exchange evening.',
  'Mujeres de diferentes orígenes comparten y se prueban trajes tradicionales entre sí durante una velada comunitaria de intercambio cultural.',
  'cultural', 'culturalCostumeExchange', date '2023-11-01', 'Odessa, TX', 16
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- shifts
--
-- duration_hours is a generated column derived from starts_at/ends_at, so it
-- is intentionally absent from this insert.
-- ---------------------------------------------------------------------------

insert into public.shifts (
  id, event_id, title, title_es, description, description_es,
  role, role_es, starts_at, ends_at, spots_total, spots_filled
) values
(
  '33333333-0000-4000-8000-000000000001',
  '11111111-0000-4000-8000-000000000001',
  'Kitchen Assistant & Food Prep', 'Asistente de Cocina y Preparación de Alimentos',
  'Help chop vegetables, prep cooking stations, and assist chefs during the International Cooking Class.',
  'Ayuda a picar verduras, preparar estaciones de cocina y asistir a los chefs durante la Clase Internacional de Cocina.',
  'Food Prep', 'Preparación de Alimentos',
  timestamp '2026-08-15 16:00' at time zone 'America/Chicago',
  timestamp '2026-08-15 19:00' at time zone 'America/Chicago',
  5, 2
),
(
  '33333333-0000-4000-8000-000000000002',
  '11111111-0000-4000-8000-000000000002',
  'Welcome Desk & Greeter', 'Mesa de Bienvenida y Recepción',
  'Greet guests, manage check-in lists, and distribute event materials for Ladies Coffee Night.',
  'Saluda a las invitadas, gestiona las listas de registro y distribuye materiales en la Noche de Café.',
  'Greeter', 'Recepción',
  timestamp '2026-08-20 18:00' at time zone 'America/Chicago',
  timestamp '2026-08-20 20:30' at time zone 'America/Chicago',
  3, 1
),
(
  '33333333-0000-4000-8000-000000000003',
  '11111111-0000-4000-8000-000000000003',
  'Festival Pavilion Setup & Logistics', 'Montaje de Pabellones y Logística del Festival',
  'Help set up tents, tables, signage, and sound equipment for the Heritage Parade & Festival.',
  'Ayuda a montar carpas, mesas, señalización y equipo de sonido para el Desfile y Festival.',
  'Event Setup', 'Montaje de Evento',
  timestamp '2026-09-12 07:30' at time zone 'America/Chicago',
  timestamp '2026-09-12 11:00' at time zone 'America/Chicago',
  10, 6
),
(
  '33333333-0000-4000-8000-000000000004',
  '11111111-0000-4000-8000-000000000004',
  'Spanish-English Bilingual Translator', 'Traductor Bilingüe Español-Inglés',
  'Provide real-time translation assistance and facilitate small group conversations during the Diversity Seminar.',
  'Brinda asistencia de traducción en tiempo real y facilita conversaciones en grupos durante el Seminario de Diversidad.',
  'Translator', 'Traductor',
  timestamp '2026-09-22 17:30' at time zone 'America/Chicago',
  timestamp '2026-09-22 20:30' at time zone 'America/Chicago',
  4, 2
),
(
  '33333333-0000-4000-8000-000000000005',
  '11111111-0000-4000-8000-000000000005',
  'Relief Box Assembly & Distribution', 'Ensamblaje y Distribución de Cajas de Ayuda',
  'Pack non-perishable food boxes, sort donated winter coats, and assist families loading supplies.',
  'Empaca cajas de alimentos no perecederos, clasifica abrigos e incentiva la carga de suministros a las familias.',
  'Distribution', 'Distribución',
  timestamp '2026-10-03 08:30' at time zone 'America/Chicago',
  timestamp '2026-10-03 13:00' at time zone 'America/Chicago',
  8, 3
)
on conflict (id) do nothing;
