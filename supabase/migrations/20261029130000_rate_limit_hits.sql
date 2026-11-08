-- A counter for the unauthenticated endpoints that cost something to call.
--
-- `create-ticket-session` reserves seats before any money exists: it calls
-- create_rsvp, which takes a hold against events.reserved_spots. Looping it
-- with fresh email addresses parks an event's whole capacity behind unpaid
-- holds, and while they last a real attendee is told the event is full. The
-- per-event unique index on (event_id, lower(email)) stops one person booking
-- twice; it does nothing about one person using twenty addresses.
--
-- `create-checkout-session` is cheaper to abuse but not free: each call writes
-- a pending donation row and creates a Stripe Checkout Session, so a loop
-- fills the donations table with noise the org has to read past, and spends
-- someone else's API quota doing it.
--
-- Kept out of `rsvps` on purpose. Counting there would mean giving bookings an
-- IP column, and an address sitting next to a name, an email and a phone
-- number is a different kind of record to keep about people who come to a
-- community event. This table holds the counter and nothing else, for a day.

create table if not exists public.rate_limit_hits (
  id         bigint generated always as identity primary key,
  -- Which endpoint, so one limit cannot consume another's budget.
  bucket     text        not null check (length(btrim(bucket)) between 1 and 64),
  -- Text rather than inet: this comes from a header the client controls, and a
  -- malformed value should spend a row, not raise an error inside a payment
  -- request.
  source_ip  text        not null check (length(source_ip) between 1 and 64),
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_hits_lookup_idx
  on public.rate_limit_hits (bucket, source_ip, created_at desc);

create index if not exists rate_limit_hits_pruning_idx
  on public.rate_limit_hits (created_at);

-- RLS on with no policies at all is the correct configuration here, not an
-- oversight: every reader and writer is an Edge Function holding the service
-- role key, which bypasses RLS entirely. With no policy, anon and
-- authenticated are denied outright. The revoke is belt and braces, because
-- Supabase grants ALL on new public tables to both roles by default.
alter table public.rate_limit_hits enable row level security;
revoke all on public.rate_limit_hits from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Count and record in one call
-- ---------------------------------------------------------------------------
--
-- One function rather than a select followed by an insert from the Edge
-- Function, so two simultaneous requests cannot both read the old count and
-- both be allowed through.

create or replace function public.record_rate_limit_hit(
  p_bucket         text,
  p_source_ip      text,
  p_window_seconds integer,
  p_limit          integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window interval;
  v_count  integer;
begin
  if p_source_ip is null or btrim(p_source_ip) = '' then
    return true;
  end if;

  if p_window_seconds is null or p_window_seconds <= 0 or p_limit is null or p_limit < 0 then
    raise exception 'invalid_rate_limit_arguments' using errcode = '22023';
  end if;

  v_window := make_interval(secs => p_window_seconds);

  -- Pruned here rather than on a schedule, because this project has no cron
  -- and a table that only grows would eventually make the lookup the slow part
  -- of taking a payment. Done on roughly one call in a hundred: deleting on
  -- every request would add a write to every payment, and would contend for
  -- locks hardest during exactly the flood this exists to limit.
  if random() < 0.01 then
    delete from public.rate_limit_hits where created_at < now() - interval '1 day';
  end if;

  select count(*)
    into v_count
    from public.rate_limit_hits
   where bucket = p_bucket
     and source_ip = p_source_ip
     and created_at >= now() - v_window;

  if v_count >= p_limit then
    return false;
  end if;

  insert into public.rate_limit_hits (bucket, source_ip)
  values (p_bucket, p_source_ip);

  return true;
end;
$$;

comment on function public.record_rate_limit_hit(text, text, integer, integer) is
  'Records one hit for (bucket, source_ip) and returns whether the caller is still under p_limit within the trailing p_window_seconds. Counting and recording are one statement so concurrent callers cannot both pass on a stale count.';

-- A new function is granted EXECUTE to PUBLIC by default, so revoking from
-- anon and authenticated alone would leave that grant standing and the limiter
-- callable by the browser -- which could then spend somebody else's budget, or
-- read nothing but still burn rows.
revoke execute on function public.record_rate_limit_hit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.record_rate_limit_hit(text, text, integer, integer)
  to service_role;
