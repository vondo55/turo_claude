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

alter table public.uploads enable row level security;
alter table public.trips enable row level security;

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
