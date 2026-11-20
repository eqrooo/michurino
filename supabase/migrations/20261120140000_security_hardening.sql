-- Защита от спама и мусора + автообслуживание базы.
-- Всё служебное лежит в схеме private: она не видна через API сайта.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.settings (k text primary key, v text not null);
insert into private.settings (k, v)
  values ('ip_salt', encode(extensions.gen_random_bytes(24), 'hex'))
  on conflict (k) do nothing;

-- счётчик обращений. IP не хранится — только его хеш с секретной солью
create table if not exists private.rate_hits (
  id bigint generated always as identity primary key,
  bucket text not null,
  key text not null,
  at timestamptz not null default now()
);
create index if not exists rate_hits_lookup on private.rate_hits (bucket, key, at);
create index if not exists rate_hits_at on private.rate_hits (at);

create or replace function private.ip_key() returns text
language plpgsql stable security definer set search_path = private, extensions as $$
declare h json; ip text;
begin
  begin h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then h := null; end;
  ip := coalesce(h->>'cf-connecting-ip', nullif(trim(split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1)), ''), h->>'x-real-ip', 'unknown');
  return encode(digest((select v from private.settings where k = 'ip_salt') || ip, 'sha256'), 'hex');
end $$;

create or replace function private.hits(b text, k text, win interval) returns int
language sql stable security definer set search_path = private as $$
  select count(*)::int from private.rate_hits where bucket = b and (k is null or key = k) and at > now() - win;
$$;

-- ---------- заявки: проверка дат и лимиты ----------
create or replace function private.guard_booking() returns trigger
language plpgsql security definer set search_path = private, public as $$
declare k text := private.ip_key();
begin
  if new.date_in < current_date - 1 or new.date_in > current_date + 800 then
    raise exception 'bad_date' using errcode = '22023';
  end if;
  if new.date_out is not null and new.date_out > new.date_in + 60 then
    raise exception 'bad_date' using errcode = '22023';
  end if;
  -- служебные поля с сайта подменить нельзя
  new.status := 'new'; new.tg_sent := false; new.created_at := now();
  if private.hits('booking', k, interval '10 minutes') >= 3
     or private.hits('booking', k, interval '1 day') >= 8
     or private.hits('booking', null, interval '1 hour') >= 30 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into private.rate_hits (bucket, key) values ('booking', k);
  return new;
end $$;
drop trigger if exists bookings_guard on public.bookings;
create trigger bookings_guard before insert on public.bookings
  for each row execute function private.guard_booking();

-- ---------- посещения: лишние накрутки молча отбрасываем ----------
create or replace function private.guard_visit() returns trigger
language plpgsql security definer set search_path = private, public as $$
declare k text := private.ip_key();
begin
  if private.hits('visit', k, interval '1 hour') >= 20
     or private.hits('visit', null, interval '1 hour') >= 3000 then
    return null;
  end if;
  insert into private.rate_hits (bucket, key) values ('visit', k);
  new.created_at := now();
  return new;
end $$;
drop trigger if exists visits_guard on public.visits;
create trigger visits_guard before insert on public.visits
  for each row execute function private.guard_visit();

-- ---------- запросы доступа: не больше 5 в час от всех вместе ----------
create or replace function public.request_admin() returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); em text;
begin
  if uid is null then return 'not_logged_in'; end if;
  if exists (select 1 from admins where user_id = uid) then return 'already_admin'; end if;
  if exists (select 1 from admin_requests where user_id = uid and status = 'pending' and created_at > now() - interval '10 minutes') then return 'too_soon'; end if;
  if (select count(*) from admin_requests where created_at > now() - interval '1 hour') >= 5 then return 'too_many'; end if;
  select email into em from auth.users where id = uid;
  update admin_requests set status = 'rejected' where user_id = uid and status = 'pending';
  insert into admin_requests (user_id, email) values (uid, em);
  return 'ok';
end $$;
revoke all on function public.request_admin() from public, anon;
grant execute on function public.request_admin() to authenticated;

-- ---------- убрали админа → его Telegram сразу перестаёт получать заявки ----------
create or replace function private.on_admin_removed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.tg_chats where user_id = old.user_id;
  delete from public.tg_link_codes where user_id = old.user_id;
  return old;
end $$;
drop trigger if exists admins_removed on public.admins;
create trigger admins_removed after delete on public.admins
  for each row execute function private.on_admin_removed();
-- на всякий случай: чаты, у которых владелец уже не админ
delete from public.tg_chats c where not exists (select 1 from public.admins a where a.user_id = c.user_id);

-- ---------- автоуборка и резервный «пинг», чтобы база не засыпала ----------
create extension if not exists pg_cron;

create or replace function private.cleanup() returns void
language plpgsql security definer set search_path = public, private as $$
begin
  delete from private.rate_hits where at < now() - interval '2 days';
  delete from public.tg_link_codes where created_at < now() - interval '1 hour';
  delete from public.visits where created_at < now() - interval '3 years';
  delete from public.admin_requests where status = 'rejected' and created_at < now() - interval '90 days';
end $$;

select cron.unschedule(jobid) from cron.job where jobname in ('michurino-cleanup', 'michurino-keepalive');
select cron.schedule('michurino-cleanup', '23 * * * *', 'select private.cleanup()');
-- запрос к API сайта раз в сутки (дублирует GitHub Actions)
select cron.schedule('michurino-keepalive', '41 5 * * *', $c$
  select net.http_get(
    url := 'https://suerxffntlexrhqujywj.supabase.co/rest/v1/posts?select=id&limit=1',
    headers := '{"apikey":"sb_publishable_Z7Gm09dDO0p9axAe7FGf7Q_SytsGapA"}'::jsonb
  )
$c$);
