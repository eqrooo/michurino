-- Занятые даты: админ отмечает, сайт показывает гостям.
create table if not exists public.booked_dates (
  day date not null,
  object text not null check (object in ('cottage', 'hall')),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  primary key (day, object)
);
alter table public.booked_dates enable row level security;

-- гости видят только дату и объект, без служебных полей
revoke all on public.booked_dates from anon, authenticated;
grant select (day, object) on public.booked_dates to anon, authenticated;
grant insert (day, object) on public.booked_dates to authenticated;
grant delete on public.booked_dates to authenticated;

create policy "anyone reads booked dates" on public.booked_dates for select to anon, authenticated using (true);
create policy "admin adds booked dates" on public.booked_dates for insert to authenticated with check ((select public.is_admin()));
create policy "admin removes booked dates" on public.booked_dates for delete to authenticated using ((select public.is_admin()));

-- старые даты (старше года) больше не нужны
create or replace function private.cleanup() returns void
language plpgsql security definer set search_path = public, private as $$
begin
  delete from private.rate_hits where at < now() - interval '2 days';
  delete from public.tg_link_codes where created_at < now() - interval '1 hour';
  delete from public.visits where created_at < now() - interval '3 years';
  delete from public.admin_requests where status = 'rejected' and created_at < now() - interval '90 days';
  delete from public.booked_dates where day < current_date - 365;
end $$;
