create extension if not exists pg_net with schema extensions;

create table public.tg_chats (
  chat_id bigint primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text,
  created_at timestamptz not null default now()
);
alter table public.tg_chats enable row level security;

create table public.tg_link_codes (
  code text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.tg_link_codes enable row level security;

alter table public.bookings add column tg_sent boolean not null default false;

create or replace function public.notify_tg_booking() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(
    url := 'https://suerxffntlexrhqujywj.supabase.co/functions/v1/tg-booking',
    body := jsonb_build_object('id', new.id),
    headers := '{"Content-Type":"application/json"}'::jsonb
  );
  return new;
end $$;
revoke all on function public.notify_tg_booking() from public, anon, authenticated;

create trigger bookings_notify_tg after insert on public.bookings
  for each row execute function public.notify_tg_booking();
