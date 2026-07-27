-- PAWTX — полная установка базы одним файлом.
-- Скопируйте ВЕСЬ файл и выполните в Supabase → SQL Editor → New query → Run.
-- Безопасно запускать повторно: таблицы создаются один раз, сид игнорирует дубли.


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
