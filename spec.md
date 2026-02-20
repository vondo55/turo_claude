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
- Dashboard with core metrics and charts
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
- Net earnings (if present in CSV)
- Average trip value
- Utilization trend by week or month
- Top performing vehicles (if vehicle-level data exists)
- Cancellations and cancellation rate
- Optional add-ons contribution (if available)

## Functional Requirements

1. Accept CSV file up to an agreed max size (ex: 25 MB).
2. Detect required columns and show missing-column feedback.
3. Parse and store cleaned records in app state/database.
4. Generate KPI cards and at least 3 charts.
5. Allow user to re-upload and replace dataset.
6. Show processing/loading states.

## Non-Functional Requirements

- Parse and render dashboard in under 10 seconds for typical files.
- Clear, non-technical error messages.
- Mobile-friendly dashboard layout (read-only interaction acceptable).
- Basic observability for upload and parse failures.

## Future Roadmap (Post-MVP)

### Phase 2

- Save multiple uploads and compare date ranges
- Vehicle-level profitability view
- Export dashboard summary as PDF/CSV

### Phase 3

- Forecasting (revenue and utilization)
- Automated insights and anomaly detection
- Scheduled weekly email summaries

### Phase 4

- Turo API integration (if available)
- Benchmarks across similar markets/fleet types

## Open Questions

- Which exact Turo CSV formats are supported first?
- Where should data be stored in v1 (local only vs hosted DB)?
- Should uploads persist between sessions in MVP?
- Which charting library best fits speed and maintainability goals?

## Milestones

1. Lock CSV schema and MVP metrics.
2. Implement upload, parse, and validation pipeline.
3. Build dashboard KPIs and charts.
4. QA with real Turo export samples.
5. Ship MVP.
