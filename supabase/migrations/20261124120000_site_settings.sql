-- Настройки сайта, которые админ переключает в админке. Читать могут все, менять — только админы.
create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.site_settings enable row level security;
create policy "anyone reads settings" on public.site_settings for select to anon, authenticated using (true);
create policy "admin updates settings" on public.site_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke insert, delete, truncate on public.site_settings from anon, authenticated;

-- показывать ли гостям календарь занятых дат (сайт + Telegram). По умолчанию — выключено.
insert into public.site_settings (key, value) values ('show_dates', 'false') on conflict (key) do nothing;
