# Decision 0001: Line-Item Allocation Policy for LR/Owner Share

- Date: 2026-02-23
- Status: Accepted
- Scope: CSV split-ratio mapping in `/Users/seeker/Desktop/data_projects/turo_codex/src/lib/csv.ts`

## Context

`LR Share + Owner Share` did not reconcile to `Total earnings` because several CSV line-items were not mapped into the split policy.

## Decision

The following previously unmapped fields are now explicitly mapped:

- `3-week discount` -> `LR 30% / Owner 70%`
- `Non-refundable discount` -> `LR 30% / Owner 70%`
- `Fines (paid to host)` -> `LR 0% / Owner 100%`
- `Airport operations fee` -> `LR 100% / Owner 0%`
- `Airport parking credit` -> `LR 100% / Owner 0%`
- `Gas fee` -> `LR 100% / Owner 0%`
- `Sales tax` -> `LR 100% / Owner 0%`

Additionally, row-level split values are no longer rounded before aggregation to reduce reconciliation drift.

## Rationale

- Aligns with existing ratio patterns already used in the project.
- Produces an auditable and consistent accounting model.
- Keeps policy explicit in source control rather than implicit in UI output.

## Consequences

- `LR Share + Owner Share` should now reconcile to `Total earnings` (subject only to display rounding).
- Future policy changes should update this decision log and split-ratio map together.
