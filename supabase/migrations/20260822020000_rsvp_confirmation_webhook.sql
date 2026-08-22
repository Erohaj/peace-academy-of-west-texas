-- Fire send-rsvp-confirmation when an RSVP is booked.
--
-- This is what the dashboard calls a "Database Webhook", written out by hand.
-- The dashboard builds one on top of `supabase_functions.http_request`, but
-- that schema only comes into existence once the feature has been switched on
-- in the UI, and here it never was -- so the generated trigger could not be
-- created and the form failed with "schema does not exist". pg_net is the
-- layer underneath it and is available regardless, so this calls it directly.
--
-- Keeping it as a migration rather than dashboard state is the better outcome
-- anyway: the trigger is now visible in the repository, travels with a fresh
-- install, and cannot be silently different between environments.
--
-- The key in the Authorization header is the project's **anon** key. That is
-- deliberate and not a leak: it already ships inside the front-end bundle to
-- every visitor, and the Edge Function's JWT check only needs some valid
-- project token, not a privileged one. The service role key would grant far
-- more than this needs and must never be committed.

create extension if not exists pg_net;

-- Fail here rather than at booking time. A missing function inside a plpgsql
-- body is not resolved until the trigger runs, which would mean discovering it
-- on a real visitor's RSVP instead of on this migration.
do $$
begin
  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'net' and p.proname = 'http_post'
  ) then
    raise exception 'net.http_post not found — pg_net did not install as expected';
  end if;
end $$;

create or replace function public.notify_rsvp_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The dispatch is wrapped because this runs *inside* the booking's
  -- transaction: an unhandled error here would roll back the INSERT, and
  -- create_rsvp would report a failure to someone whose seat was fine. Mail is
  -- the courtesy; the booking is the thing that matters. Same reasoning as
  -- sendEmail() swallowing a missing RESEND_API_KEY.
  begin
    perform net.http_post(
      url := 'https://zusgxrezbffxxhztggev.supabase.co/functions/v1/send-rsvp-confirmation',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1c2d4cmV6YmZmeHhoenRnZ2V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwOTk2NDgsImV4cCI6MjEwMDY3NTY0OH0.lTfRJ2T-IhHGLH1RvGjFAbYrYeJ5xY05EB_UIA4kIyE'
      ),
      -- Shaped like the dashboard's own payload, because the function already
      -- reads `record` out of it and should not have to care which built it.
      body := jsonb_build_object(
        'type', 'INSERT',
        'table', 'rsvps',
        'schema', 'public',
        'record', to_jsonb(new),
        'old_record', null
      ),
      timeout_milliseconds := 10000
    );
  exception when others then
    raise warning '[PAWTX] could not queue the RSVP confirmation: %', sqlerrm;
  end;

  return new;
end;
$$;

comment on function public.notify_rsvp_confirmation() is
  'Posts a new RSVP to send-rsvp-confirmation. pg_net queues the request and returns immediately, so the booking is never held up waiting on mail.';

drop trigger if exists send_rsvp_confirmation on public.rsvps;

create trigger send_rsvp_confirmation
  after insert on public.rsvps
  for each row
  execute function public.notify_rsvp_confirmation();
