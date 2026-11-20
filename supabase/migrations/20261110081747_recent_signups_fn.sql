create or replace function public.recent_signups() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from auth.users where created_at > now() - interval '1 hour';
$$;
revoke all on function public.recent_signups() from public, anon, authenticated;
grant execute on function public.recent_signups() to service_role;
-- подтверждаем почту у тех, кто уже зарегался старым способом
update auth.users set email_confirmed_at = now() where email_confirmed_at is null;
