-- Capture the name and avatar an OAuth provider supplies at signup.
--
-- With magic links the only thing known about a new user is their email, so
-- the original trigger read `full_name` and nothing else. Google returns a
-- display name and a profile picture, and the volunteer dashboard has slots
-- for both — without this they stay empty and the portal falls back to a
-- placeholder.
--
-- Key names differ by provider and by Supabase version: Google populates
-- `name`/`picture`, and Supabase normalises them to `full_name`/`avatar_url`.
-- Checking both is cheaper than depending on which one wins.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    nullif(btrim(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    )), ''),
    nullif(btrim(coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture',
      ''
    )), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Backfill anyone who signed up before this ran, and fill the gaps for users
-- who first arrived by magic link (no name) and later linked Google (name and
-- picture now present on the auth record). COALESCE keeps whatever the
-- volunteer has already set for themselves.
update public.profiles p
   set full_name  = coalesce(p.full_name, nullif(btrim(coalesce(
         u.raw_user_meta_data ->> 'full_name',
         u.raw_user_meta_data ->> 'name', '')), '')),
       avatar_url = coalesce(p.avatar_url, nullif(btrim(coalesce(
         u.raw_user_meta_data ->> 'avatar_url',
         u.raw_user_meta_data ->> 'picture', '')), ''))
  from auth.users u
 where u.id = p.id
   and (p.full_name is null or p.avatar_url is null);
