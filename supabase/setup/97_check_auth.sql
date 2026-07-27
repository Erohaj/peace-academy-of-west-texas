-- Диагностика входа. Только читает.
-- Показывает, создался ли аккаунт и сработал ли триггер создания профиля.

select
  u.email                                              as "Почта",
  case when u.email_confirmed_at is null
       then '❌ ссылка не подтверждена'
       else '✅ подтверждена' end                       as "Email",
  case when p.id is null
       then '❌ профиль НЕ создан (триггер не сработал)'
       else '✅ профиль есть, роль: ' || p.role end      as "Профиль",
  coalesce(to_char(u.last_sign_in_at at time zone 'UTC', 'DD.MM HH24:MI'), '—')
                                                        as "Последний вход (UTC)"
from auth.users u
left join public.profiles p on p.id = u.id
order by u.created_at desc
limit 10;
