create extension if not exists "pgcrypto";

create table if not exists public.uploads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  file_name text not null,
  total_trips int not null,
  gross_revenue numeric(12,2) not null,
  net_earnings numeric(12,2),
  cancellation_rate numeric(6,2) not null
);

create table if not exists public.trips (
  id bigserial primary key,
  upload_id uuid not null references public.uploads(id) on delete cascade,
  created_at timestamptz not null default now(),
  row_number int not null,
  trip_start timestamptz not null,
  trip_end timestamptz not null,
  vehicle_name text not null,
  gross_revenue numeric(12,2) not null,
  net_earnings numeric(12,2),
  addons_revenue numeric(12,2),
  is_cancelled boolean not null default false,
  status text
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'trips_upload_row_unique'
  ) then
    alter table public.trips
      add constraint trips_upload_row_unique unique (upload_id, row_number);
  end if;
end $$;

alter table public.uploads enable row level security;
alter table public.trips enable row level security;

grant usage on schema public to anon, authenticated;
grant insert on table public.uploads to anon, authenticated;
grant insert on table public.trips to anon, authenticated;
grant usage, select on sequence public.trips_id_seq to anon, authenticated;

create policy "anon can insert uploads"
  on public.uploads
  for insert
  to anon
  with check (true);

create policy "anon can insert trips"
  on public.trips
  for insert
  to anon
  with check (true);
