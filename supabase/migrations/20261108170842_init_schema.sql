create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create policy "admins see themselves" on public.admins for select to authenticated
  using (user_id = (select auth.uid()));

create table public.bookings (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 100),
  phone text not null check (char_length(phone) between 6 and 30),
  date_in date not null,
  date_out date not null,
  guests int not null default 1 check (guests between 1 and 50),
  comment text check (char_length(comment) <= 1000),
  status text not null default 'new' check (status in ('new','confirmed','done','cancelled')),
  check (date_out > date_in)
);
alter table public.bookings enable row level security;
create policy "anyone can create booking" on public.bookings for insert to anon, authenticated
  with check (status = 'new');
create policy "admin reads bookings" on public.bookings for select to authenticated using ((select public.is_admin()));
create policy "admin updates bookings" on public.bookings for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin deletes bookings" on public.bookings for delete to authenticated using ((select public.is_admin()));

create table public.posts (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  title text not null check (char_length(title) between 1 and 200),
  body text check (char_length(body) <= 5000),
  image_url text,
  published boolean not null default true
);
alter table public.posts enable row level security;
create policy "public reads published posts" on public.posts for select to anon, authenticated
  using (published or (select public.is_admin()));
create policy "admin inserts posts" on public.posts for insert to authenticated with check ((select public.is_admin()));
create policy "admin updates posts" on public.posts for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin deletes posts" on public.posts for delete to authenticated using ((select public.is_admin()));

create table public.visits (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  path text check (char_length(path) <= 300),
  referrer text check (char_length(referrer) <= 500),
  device text check (device in ('mobile','desktop','tablet'))
);
alter table public.visits enable row level security;
create policy "anyone logs a visit" on public.visits for insert to anon, authenticated with check (true);
create policy "admin reads visits" on public.visits for select to authenticated using ((select public.is_admin()));
create index visits_created_at_idx on public.visits (created_at);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', true, 10485760, array['image/jpeg','image/png','image/webp']);
create policy "admin uploads images" on storage.objects for insert to authenticated
  with check (bucket_id = 'post-images' and (select public.is_admin()));
create policy "admin deletes images" on storage.objects for delete to authenticated
  using (bucket_id = 'post-images' and (select public.is_admin()));
