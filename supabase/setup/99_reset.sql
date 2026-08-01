-- ⚠️ ОЧИСТКА — выполнять ТОЛЬКО если установка прервалась на середине
-- и шаг 1 ругается «relation already exists».
--
-- Удаляет все таблицы PAWTX вместе с данными. На свежем проекте это безопасно.
-- НА БОЕВОЙ БАЗЕ НЕ ЗАПУСКАТЬ: кроме RSVP и донатов здесь сносятся подписанные
-- волонтёрские документы, зачтённые часы и выданные сертификаты. Подпись,
-- часы и сертификат — это то, что организация предъявляет школе или суду;
-- восстановить их из бэкапа сайта нельзя, потому что их там нет.
--
-- Аккаунты пользователей (auth.users) не трогаются.
--
-- Список ниже пополняется руками вместе с новой миграцией. Забыть таблицу
-- здесь — значит получить наполовину очищенную базу, в которой повторная
-- установка снова упадёт на «already exists».

-- Триггер на auth.users нужно снять до удаления функции.
drop trigger if exists on_auth_user_created on auth.users;

-- Порядок — от зависимых к базовым, хотя cascade снял бы и произвольный.
drop table if exists
  public.document_signatures,
  public.volunteer_certificates,
  public.volunteer_applications,
  public.legal_document_versions,
  public.legal_documents,
  public.service_log,
  public.shift_signups,
  public.shifts,
  public.rsvps,
  public.events,
  public.gallery_items,
  public.donations,
  public.contact_messages,
  public.profiles
cascade;

-- create_rsvp удаляется в обеих сигнатурах: с медиасогласием (7 аргументов)
-- и до него (6). На базе, установленной старым бандлом, живёт вторая.
drop function if exists public.create_rsvp(uuid, text, text, text, integer, numeric, text);
drop function if exists public.create_rsvp(uuid, text, text, text, integer, numeric);
drop function if exists public.verify_certificate(text);
drop function if exists public.handle_new_user() cascade;
drop function if exists public.sync_shift_spots_filled() cascade;
drop function if exists public.touch_updated_at() cascade;
drop function if exists public.service_log_reject_future() cascade;
drop function if exists public.legal_document_versions_set_hash() cascade;
drop function if exists public.is_admin() cascade;

-- Политики на storage.objects живут отдельно от таблиц выше.
drop policy if exists "media: public read"   on storage.objects;
drop policy if exists "media: admins upload" on storage.objects;
drop policy if exists "media: admins update" on storage.objects;
drop policy if exists "media: admins delete" on storage.objects;

-- Бакет media. Свежие версии Supabase вешают на storage.* триггер
-- protect_delete, который запрещает удаление напрямую из SQL, — а редактор
-- выполняет весь этот файл одной транзакцией, так что незакрытая ошибка здесь
-- откатила бы и все дропы выше: человек увидел бы «ошибка», а база осталась бы
-- нетронутой. Поэтому попытка удаления обёрнута в обработчик.
--
-- Оставшийся бакет повторной установке не мешает: 00_full_setup.sql вставляет
-- его через `on conflict (id) do nothing`. Если его всё же нужно убрать —
-- Storage → media → Delete bucket в дашборде.
do $$
begin
  delete from storage.buckets where id = 'media';
  raise notice 'Бакет media удалён.';
exception when others then
  raise notice 'Бакет media оставлен (%). Установке это не мешает.', sqlerrm;
end $$;
