# Specification

## Project

Turo Codex

## Product Vision

Build a lightweight analytics app for Turo hosts. A user should be able to upload a raw `.csv` export from Turo and instantly see a dashboard with clear business insights.

## MVP Goal

Deliver the first end-to-end workflow:

1. User drags and drops one Turo CSV file.
2. System validates and parses the data.
3. Dashboard renders key KPIs and trends.
4. User can identify revenue drivers and underperforming periods quickly.

## MVP Scope

### In Scope

- CSV upload via drag-and-drop or file picker
- CSV parsing and schema validation
- Basic data normalization (dates, currency, percentages)
- Dashboard with core metrics, filters, and charts
- Error messaging for invalid or incomplete files

### Out of Scope (MVP)

- Multi-user auth and permissions
- Live API sync from Turo
- Advanced forecasting or ML recommendations
- Multi-file historical merges

## Primary User

Independent Turo host or small fleet operator who wants quick visibility into business performance without manual spreadsheet work.

## MVP Dashboard Metrics

- Total trips
- Gross revenue
- Total earnings
- Net earnings (if present in CSV)
- LR share
- Owner share
- Average trip value
- Utilization trend by week or month
- Vehicle-level breakdown (earnings, trips, LR/Owner)
- Cancellations and cancellation rate
- Optional add-ons contribution (if available)

## Current Implemented Features

- Upload and parse Turo CSV export files
- Flexible header matching tuned to real export format
- Row-level warning system for parse/validation issues
- KPI dashboard + trend charts
- `Completed trips only` toggle
- Month filter (based on `Trip end`)
- Vehicle drilldown table with totals footer:
  - Total earnings
  - Number of trips
  - LR share
  - Owner share
- LR/Owner split logic ported from legacy Python transformation
- Cents-based accounting math for aggregation (reduces floating-point rounding drift)
- Allocation policy recorded in decision log and mapped in parser
- Optional Supabase persistence for uploaded datasets

## Analytics Views (Planned Structure)

- `Overview`: high-level KPIs and trend summaries
- `Owner Economics`: earnings allocation, split ratios, and reconciliation trust metrics
- `Fleet Operations`: utilization, downtime, and vehicle-level operational metrics

## Accounting and Reconciliation Rules

- `Total earnings` is sourced from CSV `Total earnings`.
- `LR Share` and `Owner Share` are computed from mapped line-items per allocation policy.
- `Reconciliation Gap = Total earnings - (LR Share + Owner Share)`.
- All monetary aggregation is performed in integer cents and rounded for display only.
- Current policy intent is `Reconciliation Gap ~= 0` (except display-level rounding).

## Functional Requirements

1. Accept CSV file up to an agreed max size (ex: 25 MB).
2. Detect required columns and show missing-column feedback.
3. Parse and store cleaned records in app state/database.
4. Generate KPI cards, at least 3 charts, and vehicle drilldown table.
5. Support completed-only and month-level filtering.
6. Allow user to re-upload and replace dataset.
7. Show processing/loading states.

## Non-Functional Requirements

- Parse and render dashboard in under 10 seconds for typical files.
- Clear, non-technical error messages.
- Mobile-friendly dashboard layout (read-only interaction acceptable).
- Basic observability for upload and parse failures.

## Future Roadmap (Post-MVP)

### Phase 2

- Save multiple uploads and compare date ranges
- Month-over-month comparison view
- Export dashboard summary as PDF/CSV

### Phase 3

- Forecasting (revenue and utilization)
- Automated insights and anomaly detection
- Scheduled weekly email summaries

### Phase 4

- Turo API integration (if available)
- Benchmarks across similar markets/fleet types

## Open Questions

- Do we enforce `Completed only` as default in production?
- Should month filter use `Trip end` (current) or make `Trip start/end` selectable?
- Should historical comparison be per-upload, per-month, or both?
- What is the target auth model for Supabase (single owner vs multi-account)?
- Should labor-based metrics live in `Owner Economics` or a separate modeling section?
- Should downtime be calendar-based only, or adjusted by listing active windows?

## Milestones

1. Lock CSV schema and LR/Owner split assumptions.
2. Ship tabbed analytics views (`Overview`, `Owner Economics`, `Fleet Operations`).
3. Add vehicle-level downtime metrics with clear definitions.
4. Complete historical data read path from Supabase.
5. Add parser/metrics tests using real export fixtures and reconciliation checks.
