-- Make closing a roster actually work.
--
-- The unique index on (user_id, shift_id) was partial — `where shift_id is not
-- null`. That reads as exactly the right rule, and it broke the only write it
-- existed to support: Postgres will only infer a partial index for ON CONFLICT
-- when the statement repeats the index predicate, and PostgREST's upsert sends
-- column names and nothing else. So every attempt to credit hours failed with
-- 42P10, "no unique or exclusion constraint matching the ON CONFLICT
-- specification".
--
-- A plain unique index enforces the same rule. NULLs are distinct in a unique
-- index, so a volunteer can still hold any number of manual entries with no
-- shift attached, while a given shift can still credit them only once.

drop index if exists public.service_log_one_per_shift_idx;

create unique index if not exists service_log_one_per_shift_idx
  on public.service_log (user_id, shift_id);
