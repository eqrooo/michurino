alter table public.bookings add column object text not null default 'cottage' check (object in ('cottage','hall','banya','complex'));
alter table public.bookings add column hours int check (hours between 1 and 24);
alter table public.bookings alter column date_out drop not null;
alter table public.bookings drop constraint if exists bookings_check;
alter table public.bookings add constraint bookings_dates_check check (date_out is null or date_out >= date_in);
alter table public.bookings drop constraint if exists bookings_guests_check;
alter table public.bookings add constraint bookings_guests_check check (guests between 1 and 150);
