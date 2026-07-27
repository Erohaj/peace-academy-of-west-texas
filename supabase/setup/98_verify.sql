-- Проверка установки. Ничего не меняет — только читает.
-- Вставить в SQL Editor → Run. В колонке «Статус» всё должно быть ✅.

with expected(ord, name, want, got) as (
  select 1, 'Таблиц создано', '8',
    (select count(*) from pg_tables
      where schemaname = 'public'
        and tablename in ('profiles','events','rsvps','gallery_items',
                          'shifts','shift_signups','donations','contact_messages'))
  union all
  select 2, 'RLS включён на всех таблицах', '8',
    (select count(*) from pg_tables
      where schemaname = 'public' and rowsecurity
        and tablename in ('profiles','events','rsvps','gallery_items',
                          'shifts','shift_signups','donations','contact_messages'))
  union all
  -- Ключевая проверка: у rsvps и donations НЕ должно быть политик на чтение
  -- для роли anon. Если появится — данные участников станут публичными.
  select 3, 'Нет публичного доступа к rsvps/donations', '0',
    (select count(*) from pg_policies
      where schemaname = 'public'
        and tablename in ('rsvps','donations','contact_messages')
        and 'anon' = any(roles))
  union all
  select 4, 'Функция create_rsvp', '1',
    (select count(*) from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'create_rsvp')
  union all
  select 5, 'Функция is_admin', '1',
    (select count(*) from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'is_admin')
  union all
  -- Защита от самоповышения: authenticated не должен иметь права
  -- писать в колонку role.
  select 6, 'Колонка role защищена от записи', '0',
    (select count(*) from information_schema.column_privileges
      where table_schema = 'public' and table_name = 'profiles'
        and column_name = 'role' and privilege_type = 'UPDATE'
        and grantee = 'authenticated')
  union all
  select 7, 'Счётчик reserved_spots защищён', '0',
    (select count(*) from information_schema.column_privileges
      where table_schema = 'public' and table_name = 'events'
        and column_name = 'reserved_spots' and privilege_type = 'UPDATE'
        and grantee = 'authenticated')
  union all
  select 8, 'Хранилище media', '1',
    (select count(*) from storage.buckets where id = 'media')
  union all
  select 9, 'Событий загружено', '5', (select count(*) from public.events)
  union all
  select 10, 'Фото в галерее', '16', (select count(*) from public.gallery_items)
  union all
  select 11, 'Смен волонтёров', '5', (select count(*) from public.shifts)
  union all
  -- Событие «Heritage Parade» специально засеяно заполненным (150/150),
  -- чтобы можно было проверить сценарий «мест нет».
  select 12, 'Есть заполненное событие для теста', '1',
    (select count(*) from public.events where reserved_spots >= total_spots)
)
select
  name    as "Проверка",
  want    as "Ожидается",
  got::text as "Факт",
  case when want = got::text then '✅' else '❌ РАСХОЖДЕНИЕ' end as "Статус"
from expected
order by ord;
