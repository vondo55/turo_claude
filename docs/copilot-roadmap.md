# Copilot Roadmap (Read -> Propose -> Approve -> Write)

This document tracks the phased plan to add an in-app AI copilot for analytics, exports, and receipt/reimbursement operations with a safe human-approval workflow.

## Why this file exists

Supabase SQL is executed in the database console or migrations, but decisions and rollout sequencing can get lost. This roadmap keeps product scope, implementation phases, and SQL structure documented in Git.

## Goal

Build an assistant inside the app that can:
- answer questions about uploaded trip data,
- generate artifacts (CSV/PDF summaries),
- ingest receipt screenshots/files,
- propose accounting/reimbursement updates,
- require human approval before any database write.

## Phase Plan

### Phase 1: Read-only copilot (no writes)

Scope:
- Chat panel in app.
- Q&A over currently loaded dashboard dataset.
- Export actions (CSV/PDF) from filtered views.

Rules:
- No database mutations.
- Responses grounded only in loaded/queried data.
- Display source context in each response.

Success criteria:
- User can ask: "Summarize owner economics for August" and get accurate numbers.
- User can click: "Export current view" and download output.

### Phase 2: Ingestion + proposal workflow

Scope:
- Upload receipts/screenshots.
- OCR + extraction into structured fields (amount, date, vendor, vehicle, employee, category).
- Create proposed records in staging tables, not production truth tables.

Rules:
- Every proposal includes confidence and extraction metadata.
- No automatic final posting.

Success criteria:
- A receipt upload appears in "Pending Approvals" with editable extracted fields.

### Phase 3: Human-in-the-loop approvals + audited writes

Scope:
- Approval queue UI.
- Approve / reject / edit proposed changes.
- On approval, apply transactional write to canonical tables.
- Full audit trail of actor, timestamp, old/new values.

Rules:
- Only authorized users can approve.
- Every approved write is traceable.

Success criteria:
- No direct AI write path to production tables.
- Auditors can reconstruct who approved what and when.

## Step-by-step: what to do next

1. Apply schema SQL in Supabase (see Applied SQL below).
2. Add RLS policies for new tables (`employees`, `documents`, `document_extractions`, `reimbursements`, `proposed_updates`, `action_audit_log`, `document_links`).
3. Create Supabase storage bucket for receipt files (`receipts`) and attach access policies.
4. Build Phase 1 UI: chat drawer + export actions (read-only).
5. Build extraction endpoint (OCR + parser) that writes to `documents` + `document_extractions` + `proposed_updates`.
6. Build approval UI and approval transaction endpoint.
7. Add test coverage for parser/extraction mapping and approval state transitions.
8. Deploy to Vercel and verify env vars in Production/Preview.

## SQL Schema (Applied in Supabase)

This is the SQL baseline we executed. Enum creation uses `DO $$ ... EXCEPTION WHEN duplicate_object ... $$;` for Postgres compatibility.

```sql
create extension if not exists "pgcrypto";

do $$ begin
  create type public.doc_type as enum ('receipt', 'trip_screenshot', 'other');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.proposal_status as enum ('pending', 'approved', 'rejected', 'applied');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.payment_status as enum ('not_required', 'pending', 'paid', 'reimbursed');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text unique,
  active boolean not null default true
);

alter table public.trips
  add column if not exists employee_id uuid references public.employees(id),
  add column if not exists payment_status public.payment_status default 'not_required',
  add column if not exists compensation_completed boolean not null default false;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  uploaded_by uuid references auth.users(id),
  doc_type public.doc_type not null,
  storage_path text not null,
  original_filename text,
  mime_type text,
  file_size_bytes bigint,
  sha256 text
);

create table if not exists public.document_extractions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  document_id uuid not null references public.documents(id) on delete cascade,
  provider text,
  raw_text text,
  extracted_json jsonb not null default '{}'::jsonb,
  confidence numeric(5,4)
);

create table if not exists public.reimbursements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  employee_id uuid references public.employees(id),
  trip_id bigint references public.trips(id),
  amount numeric(12,2) not null,
  currency text not null default 'USD',
  description text,
  payee text,
  payer text,
  payment_status public.payment_status not null default 'pending',
  compensation_completed boolean not null default false,
  occurred_on date
);

create table if not exists public.proposed_updates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  source_document_id uuid references public.documents(id),
  target_table text not null,
  target_id text,
  proposed_patch jsonb not null,
  status public.proposal_status not null default 'pending',
  reviewer_id uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text
);

create table if not exists public.action_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id),
  actor_type text not null check (actor_type in ('human', 'assistant', 'system')),
  action text not null,
  entity_type text,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  result text,
  trace_id text
);

create table if not exists public.document_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  document_id uuid not null references public.documents(id) on delete cascade,
  reimbursement_id uuid references public.reimbursements(id) on delete cascade,
  trip_id bigint references public.trips(id) on delete cascade
);
```

## Approval transaction pattern (required)

On approve:
1. Lock proposal row (`for update`).
2. Validate proposal is still `pending`.
3. Apply write to canonical table (`reimbursements` / etc.).
4. Write `action_audit_log` with before/after.
5. Mark proposal as `applied`.
6. Commit transaction.

## Security and policy notes

- Enable RLS on all user-facing tables.
- Restrict `proposed_updates` approval to admin/manager roles only.
- Keep service-role operations server-side only.
- Never expose service key in frontend env.

### RLS validation query

Use this in Supabase SQL Editor to verify RLS status and policy count for core tables:

```sql
with target_tables as (
  select unnest(array[
    'employees',
    'documents',
    'document_extractions',
    'reimbursements',
    'proposed_updates',
    'action_audit_log',
    'document_links',
    'uploads',
    'trips'
  ]) as table_name
)
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  coalesce(p.policy_count, 0) as policy_count
from target_tables t
join pg_class c
  on c.relname = t.table_name
join pg_namespace n
  on n.oid = c.relnamespace
left join (
  select
    schemaname,
    tablename,
    count(*)::int as policy_count
  from pg_policies
  group by schemaname, tablename
) p
  on p.schemaname = n.nspname
 and p.tablename = c.relname
where n.nspname = 'public'
order by c.relname;
```

### Storage bucket setup (`receipts`)

UI steps:
1. Supabase sidebar -> `Storage`.
2. Click `New bucket`.
3. Name: `receipts`.
4. Set private bucket.
5. Click `Create bucket`.

Policy SQL used:

```sql
create policy "auth can view receipts bucket"
on storage.buckets
for select
to authenticated
using (id = 'receipts');

create policy "auth can upload receipts"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'receipts'
  and auth.uid() is not null
);

create policy "auth can read own receipts"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'receipts'
  and owner = auth.uid()
);

create policy "auth can update own receipts"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'receipts'
  and owner = auth.uid()
)
with check (
  bucket_id = 'receipts'
  and owner = auth.uid()
);

create policy "auth can delete own receipts"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'receipts'
  and owner = auth.uid()
);
```

## Environment variables

Frontend (Vite):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Server/edge functions:
- `SUPABASE_SERVICE_ROLE_KEY` (server only)
- `OPENAI_API_KEY` (if AI extraction/chat is server-side)

## Out of scope for now

- Fully autonomous posting with no reviewer.
- Complex accounting journaling (double-entry ledger).
- Multi-tenant billing and org management.

## Definition of done (MVP + safety)

- Read-only copilot is stable and export works.
- Receipt ingestion produces structured proposals.
- Human reviewer can approve/reject each proposal.
- All applied writes are auditable.
- Production deploy has correct env vars and RLS enabled.
