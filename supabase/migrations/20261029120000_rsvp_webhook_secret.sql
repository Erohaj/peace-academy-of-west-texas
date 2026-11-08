-- Stop send-rsvp-confirmation being an open mail relay.
--
-- The trigger authenticated itself to the Edge Function with the project's
-- anon key, and the comment where it did so argued that this was safe because
-- "the Edge Function's JWT check only needs some valid project token, not a
-- privileged one". That is true, and it is exactly the problem: the anon key
-- ships inside the front-end bundle to every visitor, so the JWT gate admits
-- the whole internet. The function takes its recipient straight from
-- `record.email`, which made it a way for anyone to send "You're registered"
-- from the organisation's own verified sender to any address they chose --
-- cheap phishing with a real nonprofit's name on it, and a fast way to get
-- mail.pawtx.org onto a blocklist and take every donation receipt down with
-- it. The second POST in that function goes to CONTACT_INBOX, so the org's own
-- inbox was reachable the same way.
--
-- The anon key stays in the Authorization header because the platform's JWT
-- gate still wants a valid project token. It is simply no longer mistaken for
-- proof of who is calling. That proof is now a shared secret the front-end
-- bundle does not contain.
--
-- Set it in both places, to the same value, before applying this:
--
--   supabase secrets set RSVP_WEBHOOK_SECRET=<value>
--   select vault.create_secret('<value>', 'rsvp_webhook_secret');
--
-- Deliberately read from the vault rather than written into this file: a
-- secret committed to the repository is not a secret, which is the whole
-- reason the anon key was used here in the first place.
--
-- Both triggers (send_rsvp_confirmation, send_rsvp_confirmation_on_payment)
-- already point at this function and stay attached across create or replace,
-- so they are not touched.

create or replace function public.notify_rsvp_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  -- The dispatch is wrapped because this runs *inside* the booking's
  -- transaction: an unhandled error here would roll back the INSERT, and
  -- create_rsvp would report a failure to someone whose seat was fine. Mail is
  -- the courtesy; the booking is the thing that matters. Same reasoning as
  -- sendEmail() swallowing a missing RESEND_API_KEY.
  begin
    select decrypted_secret
      into v_secret
      from vault.decrypted_secrets
     where name = 'rsvp_webhook_secret';

    -- No secret means no mail, not mail sent without one. The function refuses
    -- an unsigned request anyway, so posting regardless would turn every
    -- booking into a guaranteed 403 in the logs and hide the real cause. A
    -- warning names it instead.
    if v_secret is null or btrim(v_secret) = '' then
      raise warning '[PAWTX] rsvp_webhook_secret is missing from the vault — no confirmation sent for rsvp %', new.id;
      return new;
    end if;

    perform net.http_post(
      url := 'https://zusgxrezbffxxhztggev.supabase.co/functions/v1/send-rsvp-confirmation',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        -- Satisfies the platform's JWT gate. Public by design, and no longer
        -- load-bearing for authentication.
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1c2d4cmV6YmZmeHhoenRnZ2V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwOTk2NDgsImV4cCI6MjEwMDY3NTY0OH0.lTfRJ2T-IhHGLH1RvGjFAbYrYeJ5xY05EB_UIA4kIyE',
        -- This is the part that actually says the call came from the database.
        'x-pawtx-webhook-secret', v_secret
      ),
      -- Shaped like the dashboard's own payload, because the function already
      -- reads `record` out of it and should not have to care which built it.
      body := jsonb_build_object(
        'type', tg_op,
        'table', 'rsvps',
        'schema', 'public',
        'record', to_jsonb(new),
        'old_record', case when tg_op = 'UPDATE' then to_jsonb(old) else null end
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
  'Posts a confirmed RSVP to send-rsvp-confirmation, signed with rsvp_webhook_secret from the vault — the anon key in the Authorization header satisfies the platform JWT gate but proves nothing, since it ships in the browser bundle. pg_net queues the request and returns immediately, so the booking is never held up waiting on mail.';
