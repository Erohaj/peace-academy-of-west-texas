-- Проверка установки. Ничего не меняет — только читает.
-- Вставить в SQL Editor → Run. В колонке «Статус» всё должно быть ✅.
--
-- Список таблиц ниже пополняется руками вместе с новой миграцией: этот файл,
-- в отличие от 00_full_setup.sql, НЕ генерируется из migrations/ — проверки
-- здесь про смысл схемы, а не про её текст.

with pawtx_tables(name) as (
  values ('profiles'), ('events'), ('rsvps'), ('gallery_items'),
         ('shifts'), ('shift_signups'), ('donations'), ('contact_messages'),
         ('service_log'), ('legal_documents'), ('legal_document_versions'),
         ('volunteer_applications'), ('document_signatures'), ('volunteer_certificates')
),
-- Таблицы с персональными данными: заявки, подписи, часы, сертификаты, RSVP,
-- донаты, обращения. Ни у одной не должно быть политики для роли anon —
-- anon-ключ лежит в бандле и есть у каждого посетителя сайта.
private_tables(name) as (
  values ('profiles'), ('rsvps'), ('donations'), ('contact_messages'),
         ('shift_signups'), ('service_log'), ('volunteer_applications'),
         ('document_signatures'), ('volunteer_certificates')
),
expected(ord, name, want, got) as (
  select 1, 'Таблиц создано', '14',
    (select count(*) from pg_tables
      where schemaname = 'public'
        and tablename in (select name from pawtx_tables))
  union all
  select 2, 'RLS включён на всех таблицах', '14',
    (select count(*) from pg_tables
      where schemaname = 'public' and rowsecurity
        and tablename in (select name from pawtx_tables))
  union all
  -- Ключевая проверка: у таблиц с личными данными НЕ должно быть политик для
  -- роли anon. Появится хоть одна — данные участников станут публичными.
  select 3, 'Нет публичного доступа к личным данным', '0',
    (select count(*) from pg_policies
      where schemaname = 'public'
        and tablename in (select name from private_tables)
        and 'anon' = any(roles))
  union all
  -- Обратная сторона той же проверки: публично читаться должны ровно пять
  -- таблиц — контент сайта (events, gallery_items, shifts) и тексты документов
  -- (legal_documents, legal_document_versions), которые волонтёр должен мочь
  -- прочитать до того, как заведёт аккаунт.
  select 4, 'Публично читаются только контент и документы', '5',
    (select count(distinct tablename) from pg_policies
      where schemaname = 'public' and 'anon' = any(roles))
  union all
  select 5, 'Функция create_rsvp', '1',
    (select count(*) from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'create_rsvp')
  union all
  -- Нужна версия с 8 аргументами — та, что спрашивает про фото и видео и запоминает
  -- язык. Предыдущие версии миграции удаляют: останутся несколько — PostgREST
  -- будет выбирать между ними по именам аргументов, и вызов может попасть в старую.
  select 6, 'create_rsvp спрашивает про медиасогласие и язык', '1',
    (select count(*) from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'create_rsvp' and p.pronargs = 8)
  union all
  select 7, 'Функция is_admin', '1',
    (select count(*) from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'is_admin')
  union all
  -- Публичная проверка сертификата по номеру. Именно функция, а не политика:
  -- политика превратила бы проверку одного номера в выгрузку всех сертификатов.
  select 8, 'Функция verify_certificate', '1',
    (select count(*) from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'verify_certificate')
  union all
  -- Защита от самоповышения: authenticated не должен иметь права
  -- писать в колонку role.
  select 9, 'Колонка role защищена от записи', '0',
    (select count(*) from information_schema.column_privileges
      where table_schema = 'public' and table_name = 'profiles'
        and column_name = 'role' and privilege_type = 'UPDATE'
        and grantee = 'authenticated')
  union all
  select 10, 'Счётчик reserved_spots защищён', '0',
    (select count(*) from information_schema.column_privileges
      where table_schema = 'public' and table_name = 'events'
        and column_name = 'reserved_spots' and privilege_type = 'UPDATE'
        and grantee = 'authenticated')
  union all
  -- Подпись под документом нельзя ни изменить, ни удалить — администратору
  -- тоже. Запись, которую можно поправить задним числом, ничего не доказывает.
  select 11, 'Подписи нельзя изменить или удалить', '0',
    ((select count(*) from information_schema.column_privileges
       where table_schema = 'public' and table_name = 'document_signatures'
         and privilege_type = 'UPDATE' and grantee in ('anon', 'authenticated'))
     +
     (select count(*) from information_schema.table_privileges
       where table_schema = 'public' and table_name = 'document_signatures'
         and privilege_type = 'DELETE' and grantee in ('anon', 'authenticated')))
  union all
  -- В выданном сертификате правятся ровно два поля — отметка об отзыве и его
  -- причина. Часы, период и состав записей заморожены на момент выдачи.
  select 12, 'В сертификате правится только отзыв', '2',
    (select count(*) from information_schema.column_privileges
      where table_schema = 'public' and table_name = 'volunteer_certificates'
        and privilege_type = 'UPDATE' and grantee = 'authenticated')
  union all
  select 13, 'Хранилище media', '1',
    (select count(*) from storage.buckets where id = 'media')
  union all
  select 14, 'Событий загружено', '5', (select count(*) from public.events)
  union all
  select 15, 'Фото в галерее', '16', (select count(*) from public.gallery_items)
  union all
  select 16, 'Смен волонтёров', '5', (select count(*) from public.shifts)
  union all
  -- Шесть документов волонтёрского пакета из legal/*.md.
  select 17, 'Документов для волонтёров', '6',
    (select count(*) from public.legal_documents)
  union all
  select 18, 'Действующих версий документов', '6',
    (select count(*) from public.legal_document_versions where is_current)
  union all
  -- Хэш текста считает триггер. Пустой хэш означает, что триггер не создался,
  -- а без хэша подпись перестаёт доказывать, какой именно текст человек видел.
  select 19, 'У всех версий посчитан хэш текста', '0',
    (select count(*) from public.legal_document_versions
      where body_hash is null or btrim(body_hash) = '')
  union all
  -- Событие «Heritage Parade» специально засеяно заполненным (150/150),
  -- чтобы можно было проверить сценарий «мест нет».
  select 20, 'Есть заполненное событие для теста', '1',
    (select count(*) from public.events where reserved_spots >= total_spots)
  union all
  -- Предоплата билетов: флаг на событии и статус оплаты на брони.
  -- Без них сайт соберётся, но платная регистрация упадёт на первом же госте.
  select 21, 'Колонки предоплаты на месте', '2',
    ((select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'events'
         and column_name = 'payment_required')
     +
     (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'rsvps'
         and column_name = 'payment_status'))
  union all
  -- Пять функций, которые ведут деньги и счётчик мест вместе:
  -- подтверждение оплаты, два вида возврата места, возврат денег и
  -- ручная отметка наличных админом.
  select 22, 'Функции оплаты брони', '4',
    (select count(*) from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('mark_rsvp_paid', 'release_rsvp_hold', 'mark_rsvp_refunded',
                          'release_expired_rsvp_holds'))
  union all
  -- Главная проверка безопасности платежей: посетитель не должен мочь
  -- вызвать ни одну из них — иначе любой сможет пометить свою броню
  -- оплаченной, не заплатив. В PostgreSQL новая функция по умолчанию доступна
  -- PUBLIC, так что право надо снимать явно, и именно такой пропуск
  -- нигде больше не виден.
  select 23, 'anon не может подтверждать оплату', '0',
    (select count(*) from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('mark_rsvp_paid', 'release_rsvp_hold', 'mark_rsvp_refunded',
                          'release_expired_rsvp_holds')
        and has_function_privilege('anon', p.oid, 'EXECUTE'))
  union all
  -- Письмо уходит двумя путями: сразу — если платить не надо, и после
  -- оплаты — если надо. Остался только первый — тот, кто заплатил, не
  -- получит ничего.
  select 24, 'Триггеры подтверждения RSVP', '2',
    (select count(*) from pg_trigger
      where tgrelid = 'public.rsvps'::regclass
        and tgname in ('send_rsvp_confirmation', 'send_rsvp_confirmation_on_payment'))
)
select
  name    as "Проверка",
  want    as "Ожидается",
  got::text as "Факт",
  case when want = got::text then '✅' else '❌ РАСХОЖДЕНИЕ' end as "Статус"
from expected
order by ord;
