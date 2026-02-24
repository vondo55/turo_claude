-- Secure RLS migration for uploads/trips.
-- Before running, replace YOUR_AUTH_EMAIL with the signed-in test account email.

create extension if not exists pgcrypto;

alter table public.uploads add column if not exists user_id uuid;
alter table public.trips add column if not exists user_id uuid;

-- Backfill legacy rows to a single owner for transition.
do $$
declare
  owner_id uuid;
begin
  select id
  into owner_id
  from auth.users
  where email = 'YOUR_AUTH_EMAIL'
  limit 1;

  if owner_id is null then
    raise exception 'No auth.users record found for email: %', 'YOUR_AUTH_EMAIL';
  end if;

  update public.uploads
  set user_id = owner_id
  where user_id is null;

  update public.trips t
  set user_id = u.user_id
  from public.uploads u
  where t.user_id is null
    and t.upload_id = u.id;
end $$;

alter table public.uploads alter column user_id set default auth.uid();
alter table public.trips alter column user_id set default auth.uid();

alter table public.uploads alter column user_id set not null;
alter table public.trips alter column user_id set not null;

-- Ensure trip fingerprint exists for strict dedupe key.
alter table public.trips add column if not exists guest_name text not null default 'Unknown guest';
alter table public.trips add column if not exists trip_fingerprint text;

update public.trips
set trip_fingerprint = encode(
  digest(
    lower(trim(vehicle_name)) || '|' ||
    lower(trim(coalesce(guest_name, 'Unknown guest'))) || '|' ||
    trip_start::text || '|' ||
    trip_end::text,
    'sha256'
  ),
  'hex'
)
where trip_fingerprint is null;

alter table public.trips alter column trip_fingerprint set not null;

alter table public.trips drop constraint if exists trips_trip_fingerprint_unique;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'trips_user_trip_fingerprint_unique'
  ) then
    alter table public.trips
      add constraint trips_user_trip_fingerprint_unique unique (user_id, trip_fingerprint);
  end if;
end $$;

-- Minimum privileges: authenticated only.
revoke all on table public.uploads from anon;
revoke all on table public.trips from anon;

grant select, insert on table public.uploads to authenticated;
grant select, insert, update on table public.trips to authenticated;

-- Remove permissive policies.
drop policy if exists "anon can insert uploads" on public.uploads;
drop policy if exists "anon can insert trips" on public.trips;
drop policy if exists "anon can update trips" on public.trips;
drop policy if exists "anon can read uploads" on public.uploads;
drop policy if exists "anon can read trips" on public.trips;
drop policy if exists "client can insert uploads" on public.uploads;
drop policy if exists "client can all trips" on public.trips;

drop policy if exists "auth can read uploads" on public.uploads;
drop policy if exists "auth can insert uploads" on public.uploads;
drop policy if exists "auth can read trips" on public.trips;
drop policy if exists "auth can insert trips" on public.trips;
drop policy if exists "auth can update trips" on public.trips;

-- User-scoped policies.
create policy "read own uploads"
on public.uploads
for select
to authenticated
using (user_id = auth.uid());

create policy "insert own uploads"
on public.uploads
for insert
to authenticated
with check (user_id = auth.uid());

create policy "read own trips"
on public.trips
for select
to authenticated
using (user_id = auth.uid());

create policy "insert own trips"
on public.trips
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.uploads u
    where u.id = upload_id
      and u.user_id = auth.uid()
  )
);

create policy "update own trips"
on public.trips
for update
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.uploads u
    where u.id = upload_id
      and u.user_id = auth.uid()
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.uploads u
    where u.id = upload_id
      and u.user_id = auth.uid()
  )
);
