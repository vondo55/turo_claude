# Turo Codex

Turo Codex is a lightweight analytics product for Turo hosts.

The initial MVP focuses on one core workflow: upload a raw Turo `.csv` export and immediately get a dashboard with business insights.

## MVP Idea

The first release should answer:

- How is the business performing right now?
- Which vehicles/time periods are driving revenue?
- Where are there obvious losses or inefficiencies?

## MVP Features

- Drag-and-drop CSV upload
- CSV validation and parsing
- Normalized trip and earnings dataset
- Dashboard with key KPIs and trends
- Friendly error handling when uploads fail

## Example Insights

- Total trips and gross revenue
- Average trip value
- Utilization trend over time
- Cancellations rate
- Top performing vehicles

## Current Status

- Product direction drafted
- MVP scope defined in `/Users/seeker/Desktop/data_projects/turo_codex/spec.md`
- Repository ready for implementation scaffolding

## Next Build Steps

1. Confirm the exact Turo CSV schema(s) to support first.
2. Choose the app stack (frontend, backend, storage).
3. Implement ingestion and validation flow.
4. Build dashboard components and charts.
5. Test with real-world CSV exports and ship MVP.
