-- One way to pay for a seat: a card, up front, through Stripe.
--
-- The prepaid-ticket migration shipped with a second path beside it. An admin
-- could record a fee taken in person -- cash, a cheque, a waiver -- so that a
-- roster for an event advertised as "payment at the door" could still be
-- settled in the system. It was built, tested and never used, and running the
-- shape past the organisation found the reason: they do not want two kinds of
-- money in one table. An event either takes its fee through this site, or this
-- site stays out of the transaction entirely and the money is handled the way
-- it always was, off the record.
--
-- So the in-person half comes out. What is left is the smaller, truer claim:
-- `payment_status = 'paid'` means Stripe took the money. Nothing in this
-- database asserts anything about cash that passed over a table in Odessa,
-- because nothing here is in a position to know.
--
-- Nothing is lost in the removal. `admin_set_rsvp_payment` was never called in
-- production -- the feature flag that would have surfaced its control has been
-- off since the day it shipped -- so there are no rows recording a manual
-- payment and no history to preserve. The check below proves that rather than
-- assuming it.

-- ---------------------------------------------------------------------------
-- Refuse to run if the assumption is wrong
-- ---------------------------------------------------------------------------
--
-- If a manual payment was ever recorded, this migration would quietly rewrite
-- the organisation's own record of money it received. Better to stop and have
-- somebody look than to be tidy about it.

do $$
declare
  v_manual integer;
begin
  select count(*) into v_manual
    from public.rsvps
   where payment_method is not null and payment_method <> 'card';

  if v_manual > 0 then
    raise exception
      'Refusing to drop manual payments: % booking(s) record one. Export them before re-running.',
      v_manual;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The admin-facing function goes
-- ---------------------------------------------------------------------------

drop function if exists public.admin_set_rsvp_payment(uuid, boolean, text);

-- The trigger existed only to stamp who recorded an in-person payment.
drop trigger if exists stamp_marked_paid_by on public.rsvps;
drop function if exists public.rsvps_stamp_marked_paid_by();

alter table public.rsvps drop column if exists marked_paid_by;

-- ---------------------------------------------------------------------------
-- payment_method narrows to the only thing that can write it
-- ---------------------------------------------------------------------------
--
-- Kept rather than dropped: `paid` and a method of `card` say two different
-- things, and the day somebody asks "how did this get paid?" the answer should
-- be in the row rather than inferred from the absence of alternatives. The
-- constraint is what makes the single value a statement instead of an accident.

alter table public.rsvps drop constraint if exists rsvps_payment_method_check;

alter table public.rsvps
  add constraint rsvps_payment_method_check
  check (payment_method is null or payment_method = 'card');

comment on column public.rsvps.payment_method is
  'How the fee was settled. Only ever ''card'' -- Stripe is the single way this site takes money for a seat, and the webhook is the only writer. Null until then.';

-- `mark_rsvp_paid` keeps its three arguments. The webhook deployed today calls
-- it with p_method => 'card', and changing the signature would break that call
-- the moment this migration lands and before a redeploy could follow. The
-- constraint above is what holds the value to one thing; the parameter is just
-- how it arrives.
comment on function public.mark_rsvp_paid(uuid, text, text) is
  'Confirms a booking once Stripe reports its fee paid, re-taking the seats if the hold had already lapsed. Idempotent. Called by the stripe-webhook Edge Function with the service role, always with p_method => ''card''.';
