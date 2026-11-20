create table public.admin_requests (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected'))
);
alter table public.admin_requests enable row level security;
create policy "admins read requests" on public.admin_requests for select to authenticated using ((select public.is_admin()));
create policy "user reads own requests" on public.admin_requests for select to authenticated using (user_id = (select auth.uid()));

-- пользователь просит доступ (не чаще раза в 10 минут)
create or replace function public.request_admin() returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); em text;
begin
  if uid is null then return 'not_logged_in'; end if;
  if exists (select 1 from admins where user_id = uid) then return 'already_admin'; end if;
  if exists (select 1 from admin_requests where user_id = uid and status = 'pending' and created_at > now() - interval '10 minutes') then return 'too_soon'; end if;
  select email into em from auth.users where id = uid;
  update admin_requests set status = 'rejected' where user_id = uid and status = 'pending';
  insert into admin_requests (user_id, email) values (uid, em);
  return 'ok';
end $$;
revoke all on function public.request_admin() from public, anon;
grant execute on function public.request_admin() to authenticated;

-- админ одобряет / отклоняет
create or replace function public.decide_admin(req_id bigint, approve boolean) returns text
language plpgsql security definer set search_path = public as $$
declare r admin_requests;
begin
  if not is_admin() then return 'forbidden'; end if;
  select * into r from admin_requests where id = req_id and status = 'pending';
  if not found then return 'not_found'; end if;
  update admin_requests set status = case when approve then 'approved' else 'rejected' end where id = req_id;
  if approve then insert into admins (user_id) values (r.user_id) on conflict do nothing; end if;
  return 'ok';
end $$;
revoke all on function public.decide_admin(bigint, boolean) from public, anon;
grant execute on function public.decide_admin(bigint, boolean) to authenticated;

-- список админов с почтами (только для админов)
create or replace function public.list_admins() returns table (user_id uuid, email text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.user_id, u.email::text, a.created_at from admins a join auth.users u on u.id = a.user_id
  where is_admin() order by a.created_at;
$$;
revoke all on function public.list_admins() from public, anon;
grant execute on function public.list_admins() to authenticated;

-- убрать админа (нельзя убрать себя)
create or replace function public.remove_admin(target uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then return 'forbidden'; end if;
  if target = auth.uid() then return 'self'; end if;
  delete from admins where user_id = target;
  return 'ok';
end $$;
revoke all on function public.remove_admin(uuid) from public, anon;
grant execute on function public.remove_admin(uuid) to authenticated;
