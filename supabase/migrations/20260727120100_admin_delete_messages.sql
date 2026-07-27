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
