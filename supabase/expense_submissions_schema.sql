-- Reimbursement / expense submissions form backend
-- Run this in Supabase SQL Editor after secure_rls_migration.sql

create extension if not exists pgcrypto;

create table if not exists public.expense_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  requester_name text not null,
  expense_date date not null,
  amount numeric(12,2) not null,
  errand_amount numeric(12,2),
  description text not null,
  paid_personal_card boolean not null,
  vehicle text not null,
  receipt_document_ids uuid[] not null default '{}'::uuid[],
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists expense_submissions_user_created_idx
  on public.expense_submissions (user_id, created_at desc);

alter table public.expense_submissions enable row level security;

revoke all on table public.expense_submissions from anon;
grant select, insert, update on table public.expense_submissions to authenticated;

drop policy if exists "read own expense submissions" on public.expense_submissions;
create policy "read own expense submissions"
on public.expense_submissions
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "insert own expense submissions" on public.expense_submissions;
create policy "insert own expense submissions"
on public.expense_submissions
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "update own expense submissions" on public.expense_submissions;
create policy "update own expense submissions"
on public.expense_submissions
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
