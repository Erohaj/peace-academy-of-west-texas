-- A stated price for attending an event.
--
-- The fee always existed; it was just written into the description ("💰
-- Workshop Fee: $60"), where nothing could read it. The grid clamps that text
-- to three lines and the calendar to two, so the one number a visitor needs
-- before deciding whether to book was usually the part that got cut off. This
-- makes it a field.
--
-- Nullable on purpose, and null is not zero. Null means no price has been
-- stated — which is where every existing row starts, because guessing "free"
-- on the organisation's behalf would advertise a price it never set. Zero is
-- an explicit, publishable "Free". The UI keeps the two apart: null renders
-- nothing at all, zero renders "Free".
--
-- No currency column: PAWTX runs in Odessa, Texas and charges in dollars.
-- Nothing here charges anyone either — the site takes no payment for events
-- (see the donation widget's deliberate lack of a card field), so this is a
-- published figure, not an amount this system will ever collect.

alter table public.events
  add column if not exists fee numeric(10, 2);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.events'::regclass
       and conname = 'events_fee_nonnegative'
  ) then
    alter table public.events
      add constraint events_fee_nonnegative check (fee is null or fee >= 0);
  end if;
end $$;

comment on column public.events.fee is
  'Cost per attendee in US dollars. Null means no price has been stated; 0 means explicitly free — the two are displayed differently and must not be conflated. This site never charges it.';

-- UPDATE on events is granted column by column (the table-wide grant is
-- revoked so that reserved_spots stays out of an admin's reach), and a new
-- column is not covered by that earlier list. Without this the admin panel
-- could set a fee when creating an event and never correct it afterwards --
-- the same trap collect_media_consent had to be dug out of.
grant update (fee) on public.events to authenticated;
