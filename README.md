# Turo Codex

Turo Codex is an MVP analytics app for Turo hosts.

Upload a raw Turo CSV export and get an immediate dashboard of business insights (KPIs, trends, and vehicle drilldowns).

## What Works Now

- Drag-and-drop CSV upload (or file picker)
- CSV parsing with flexible header matching
- Required-field validation and row-level warnings
- Dashboard with KPIs + 3 charts
- `Completed trips only` filter
- Month drilldown filter (by `Trip end`)
- Vehicle breakdown table: total earnings, trips, LR share, owner share, plus totals row
- LR/Owner split logic ported from legacy Python workflow
- Optional Supabase persistence for uploads/trips

Parser is tuned and verified against:
- `/Users/seeker/Desktop/data_projects/Turo-analytics/data/raw/trip_earnings_export_20251116.csv`

Primary mapped columns from that export:
- `Trip start`
- `Trip end`
- `Trip price` (gross)
- `Total earnings` (net)
- `Vehicle name`
- `Trip status`
- `Extras`

## Quick Start (Localhost)

### 1. Install dependencies

```bash
npm install
```

### 2. Run dev server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### 3. Test immediately

Use `/Users/seeker/Desktop/data_projects/turo_codex/sample/turo_sample.csv` in the upload zone.

## Fastest Build Path From Here

1. Add month-over-month comparison view.
2. Add a column-mapping UI for unmatched headers.
3. Add Supabase read path for historical uploads in-app.
4. Add parser and metrics tests for the real Turo CSV schema.

## Supabase Setup (Clear Step-by-Step)

### A. Create project

1. Go to [https://supabase.com](https://supabase.com) and create a project.
2. Open SQL Editor in your project.
3. Run the SQL in `/Users/seeker/Desktop/data_projects/turo_codex/supabase/schema.sql`.

### B. Add environment variables

1. In Supabase dashboard, copy:
- `Project URL`
- `anon public key`
2. Create `.env` in `/Users/seeker/Desktop/data_projects/turo_codex`:

```bash
cp .env.example .env
```

3. Fill values:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

4. Restart dev server (`npm run dev`).

### C. Use in app

1. Check `Save this upload to Supabase`.
2. Upload a CSV.
3. Verify rows in tables:
- `public.uploads`
- `public.trips`

## Notes on Security for MVP

Current SQL enables anonymous inserts for fast MVP testing. Before production:

- Add authentication
- Replace open insert policies with user-scoped policies
- Consider moving inserts behind a server-side API

## Scripts

- `npm run dev`: Start local dev server
- `npm run build`: Type-check + production build
- `npm run preview`: Preview production build locally

## Project Files

- `/Users/seeker/Desktop/data_projects/turo_codex/spec.md`: Product specification
- `/Users/seeker/Desktop/data_projects/turo_codex/docs/decisions/0001-line-item-allocation.md`: Allocation policy decision log
- `/Users/seeker/Desktop/data_projects/turo_codex/src/lib/csv.ts`: CSV parsing + validation
- `/Users/seeker/Desktop/data_projects/turo_codex/src/lib/metrics.ts`: KPI/insight calculations
- `/Users/seeker/Desktop/data_projects/turo_codex/src/components/Dashboard.tsx`: KPI/charts/vehicle breakdown UI
- `/Users/seeker/Desktop/data_projects/turo_codex/src/App.tsx`: Upload flow + filtering controls
- `/Users/seeker/Desktop/data_projects/turo_codex/src/lib/supabase.ts`: Supabase persistence
- `/Users/seeker/Desktop/data_projects/turo_codex/supabase/schema.sql`: Database schema + policies
