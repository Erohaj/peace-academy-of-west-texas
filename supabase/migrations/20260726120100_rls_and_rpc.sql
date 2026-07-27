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
