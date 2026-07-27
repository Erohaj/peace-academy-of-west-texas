-- Fix: admins could not actually review an application.
--
-- The previous migration revoked table-wide UPDATE on volunteer_applications
-- and granted back only the columns an applicant edits about themselves
-- (phone, address, emergency contact, and so on) — modelled on the same
-- pattern used for profiles.role and shifts.spots_filled. But those two
-- precedents are cases where NO ONE should touch the column through the app,
-- admins included. This is not that case: the "applications: admins manage"
-- row policy exists specifically so an admin CAN set status, reviewed_by,
-- reviewed_at and review_note.
--
-- Column GRANTs and row-level policies are separate gates, and both must
-- pass. There is no separate Postgres role for "admin" — an admin connects
-- as `authenticated` exactly like an applicant, distinguished only by the
-- `is_admin()` check inside the row policy. Leaving the review columns out
-- of the GRANT blocked the operation for the whole `authenticated` role
-- before the row policy was ever consulted, which silently disabled review
-- for every admin, not just for applicants.
--
-- This is safe to add back: a non-admin attempting the same UPDATE still
-- matches zero rows under the "admins manage" USING clause (their only
-- other policies are "read own", for SELECT, and "submit own", for INSERT),
-- so widening the column grant does not widen who can act — only whether an
-- admin who already clears the row policy is also allowed to touch the
-- column.

grant update (status, reviewed_by, reviewed_at, review_note)
  on public.volunteer_applications to authenticated;
