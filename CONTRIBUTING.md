# Contributing to Turo Codex
Read this before writing a single line. It's short.
---
## Stack
| Layer | Choice | What's banned |
|-------|--------|---------------|
| UI | React + TypeScript | No class components |
| Styling | Plain CSS (`src/styles/app.css`) | No Tailwind, no CSS modules, no styled-components, no inline `style={}` |
| Charts | Recharts only | No Chart.js, no D3, no Victory |
| Dates | Native `Date` + `toLocaleDateString` | No date-fns, no dayjs, no moment, no Luxon |
| Database | Supabase (via `src/lib/supabase.ts`) | Never import `supabaseClient` directly in a component |
| Type checking | TypeScript strict mode | No `any`, no `// @ts-ignore` |
---
## Project structure
```
src/
  App.tsx                  ← top-level shell, routing, auth state
  main.tsx                 ← entry point, do not edit
  styles/
    app.css                ← all styles live here
  lib/
    types.ts               ← ALL shared TypeScript types live here
    supabase.ts            ← ALL database calls live here
    csv.ts                 ← CSV parsing and validation
    metrics.ts             ← dashboard calculations
    copilot.ts             ← AI copilot context and logic
  components/
    Dashboard.tsx          ← main dashboard (overview, owner economics, fleet ops)
    ReimbursementForm.tsx  ← expense submission form
    CopilotDrawer.tsx      ← AI assistant drawer
    UploadZone.tsx         ← CSV upload drop zone
    MultiSelectFilter.tsx  ← reusable filter component
```
---
## The rules
### 1. Types go in `types.ts`
If a type is used in more than one file, it belongs in `src/lib/types.ts`. Never define shared shapes inline or in component files.
```ts
// ✅ correct
import type { VehicleBreakdown } from '../lib/types';
// ❌ wrong — inline type in a component
type VehicleBreakdown = { vehicle: string; trips: number; ... }
```
### 2. Database calls go in `supabase.ts`
Components never touch Supabase directly. All reads and writes are named functions exported from `src/lib/supabase.ts`.
```ts
// ✅ correct
import { saveUploadToSupabase } from '../lib/supabase';
// ❌ wrong — importing the client directly
import { supabase } from '../lib/supabase';
await supabase.from('trips').select('*');
```
### 3. All data is org-scoped
Every database operation is scoped to the user's organization. Row-level security enforces this at the database level, but your code should also never query without context. The `getCurrentUserContext()` function in `supabase.ts` gives you `{ userId, orgId }`.
### 4. Plain CSS only
All styles go in `src/styles/app.css`. Use class names, not inline styles.
```tsx
// ✅ correct
<div className="kpi-card">
// ❌ wrong
<div style={{ padding: '16px', background: '#fff' }}>
```
### 5. No date libraries
Use native Date methods. The codebase already has helpers for formatting — check `metrics.ts` before writing a new one.
```ts
// ✅ correct
date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
// ❌ wrong
import { format } from 'date-fns';
```
### 6. Recharts only for charts
All charts use Recharts components (`LineChart`, `BarChart`, `ResponsiveContainer`, etc). Do not introduce a second charting library.
### 7. No `any`
TypeScript strict mode is on. If you don't know the type, use `unknown` and narrow it, or add the type to `types.ts`.
---
## Roles and data access
The app has three roles. Build features with these in mind:
| Role | Can do |
|------|--------|
| `owner` | Full access — org settings, all data, approve expenses |
| `manager` | Read all org data, upload CSVs, approve/reject expenses |
| `employee` | Submit expenses and receipts, view own submissions only |
---
## Running locally
```bash
npm install
npm run dev        # starts at http://localhost:5173
npm run build      # type-check + production build
```
You need a `.env` file with Supabase credentials:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```
Ask for these — do not commit them.
---
## Before you open a PR
- [ ] `npm run build` passes with no errors
- [ ] No new `any` types introduced
- [ ] New shared types added to `types.ts`
- [ ] New database calls added to `supabase.ts`
- [ ] No new CSS frameworks or date libraries added
