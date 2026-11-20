-- Гости бронируют через Telegram-мини-приложение (book.html → функция tg-guest).

alter table public.bookings add column if not exists tg_user_id bigint;
alter table public.bookings add column if not exists tg_username text check (char_length(tg_username) <= 64);
alter table public.bookings add column if not exists tg_status_sent text;   -- о каком статусе гость уже уведомлён
create index if not exists bookings_tg_user_idx on public.bookings (tg_user_id, created_at) where tg_user_id is not null;

-- «регистрация» гостя: запоминаем имя и телефон, чтобы не вводить заново. Доступ только из функций.
create table if not exists public.tg_guests (
  tg_user_id bigint primary key,
  name text check (char_length(name) <= 100),
  phone text check (char_length(phone) <= 30),
  username text check (char_length(username) <= 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tg_guests enable row level security;

-- заявки: с сайта поля Telegram подставить нельзя; заявки из функции (service role) лимитирует сама функция
create or replace function private.guard_booking() returns trigger
language plpgsql security definer set search_path = private, public as $$
declare k text; svc boolean;
begin
  svc := coalesce(nullif(current_setting('request.jwt.claims', true), '')::json->>'role', '') = 'service_role'
         or coalesce(current_setting('role', true), '') = 'service_role';
  if new.date_in < current_date - 1 or new.date_in > current_date + 800 then
    raise exception 'bad_date' using errcode = '22023';
  end if;
  if new.date_out is not null and new.date_out > new.date_in + 60 then
    raise exception 'bad_date' using errcode = '22023';
  end if;
  new.status := 'new'; new.tg_sent := false; new.created_at := now(); new.tg_status_sent := null;
  if svc then return new; end if;
  new.tg_user_id := null; new.tg_username := null;
  k := private.ip_key();
  if private.hits('booking', k, interval '10 minutes') >= 3
     or private.hits('booking', k, interval '1 day') >= 8
     or private.hits('booking', null, interval '1 hour') >= 30 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into private.rate_hits (bucket, key) values ('booking', k);
  return new;
end $$;

-- админ поменял статус заявки из Telegram → сообщаем гостю
create or replace function public.notify_tg_guest() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(
    url := 'https://suerxffntlexrhqujywj.supabase.co/functions/v1/tg-guest',
    body := jsonb_build_object('event', 'status', 'id', new.id),
    headers := '{"Content-Type":"application/json"}'::jsonb
  );
  return new;
end $$;
revoke all on function public.notify_tg_guest() from public, anon, authenticated;
drop trigger if exists bookings_notify_guest on public.bookings;
create trigger bookings_notify_guest after update of status on public.bookings
  for each row when (new.tg_user_id is not null and new.status is distinct from old.status)
  execute function public.notify_tg_guest();
