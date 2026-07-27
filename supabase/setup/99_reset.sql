-- ⚠️ ОЧИСТКА — выполнять ТОЛЬКО если установка прервалась на середине
-- и шаг 1 ругается «relation already exists».
--
-- Удаляет все таблицы PAWTX вместе с данными. На свежем проекте это безопасно.
-- НА БОЕВОЙ БАЗЕ С РЕАЛЬНЫМИ RSVP И ДОНАТАМИ НЕ ЗАПУСКАТЬ.
--
-- Аккаунты пользователей (auth.users) не трогаются.

-- Триггер на auth.users нужно снять до удаления функции.
drop trigger if exists on_auth_user_created on auth.users;

drop table if exists
  public.shift_signups,
  public.shifts,
  public.rsvps,
  public.events,
  public.gallery_items,
  public.donations,
  public.contact_messages,
  public.profiles
cascade;

drop function if exists public.create_rsvp(uuid, text, text, text, integer, numeric);
drop function if exists public.handle_new_user() cascade;
drop function if exists public.sync_shift_spots_filled() cascade;
drop function if exists public.touch_updated_at() cascade;
drop function if exists public.is_admin() cascade;

-- Политики на storage.objects живут отдельно от таблиц выше.
drop policy if exists "media: public read"   on storage.objects;
drop policy if exists "media: admins upload" on storage.objects;
drop policy if exists "media: admins update" on storage.objects;
drop policy if exists "media: admins delete" on storage.objects;

-- Удаляем бакет только если он пуст — иначе сначала уберите из него файлы.
delete from storage.buckets where id = 'media';
