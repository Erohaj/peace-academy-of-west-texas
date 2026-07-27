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

-- ---------------------------------------------------------------------------
-- Attendance, on the roster row that already exists per volunteer per shift.
-- ---------------------------------------------------------------------------

alter table public.shift_signups
  add column attendance text check (attendance in ('attended', 'no_show'));

comment on column public.shift_signups.attendance is
  'Null means the roster has not been closed yet — which is how staff find the shifts still waiting to be processed. Only admins can set it: volunteers have select, insert and delete policies on this table but no update policy, so an UPDATE from one is refused by RLS.';

-- ---------------------------------------------------------------------------
-- service_log — the single source of credited hours.
-- ---------------------------------------------------------------------------

create table public.service_log (
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
create unique index service_log_one_per_shift_idx
  on public.service_log (user_id, shift_id)
  where shift_id is not null;

create index service_log_user_served_idx
  on public.service_log (user_id, served_on desc);

-- A CHECK constraint cannot call current_date — it has to be immutable — so
-- the "not in the future" rule lives in a trigger. Without it a mistyped year
-- silently credits hours nobody has served yet.
create function public.service_log_reject_future()
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

create trigger service_log_no_future_dates
  before insert or update on public.service_log
  for each row execute function public.service_log_reject_future();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.service_log enable row level security;

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
