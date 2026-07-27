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
