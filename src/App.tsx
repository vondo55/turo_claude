import { useMemo, useState } from 'react';
import Dashboard from './components/Dashboard';
import UploadZone from './components/UploadZone';
import { parseTuroCsv } from './lib/csv';
import { buildDashboardData } from './lib/metrics';
import { saveUploadToSupabase, supabase } from './lib/supabase';
import type { DashboardData, TuroTripRecord } from './lib/types';

function getErrorMessage(caughtError: unknown) {
  if (caughtError instanceof Error) {
    return caughtError.message;
  }

  if (typeof caughtError === 'object' && caughtError !== null) {
    const candidate = caughtError as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [candidate.message, candidate.details, candidate.hint]
      .filter((value): value is string => typeof value === 'string' && value.length > 0);
    if (parts.length > 0) {
      const combined = parts.join(' | ');
      return typeof candidate.code === 'string' && candidate.code.length > 0
        ? `${combined} (code: ${candidate.code})`
        : combined;
    }
  }

  return 'Unknown upload error';
}

export default function App() {
  const [records, setRecords] = useState<TuroTripRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saveToSupabase, setSaveToSupabase] = useState(false);
  const [lastFileName, setLastFileName] = useState<string | null>(null);
  const [completedOnly, setCompletedOnly] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState('all');

  const monthOptions = useMemo(() => {
    const uniqueMonths = new Set(
      records.map((record) =>
        `${record.tripEnd.getFullYear()}-${String(record.tripEnd.getMonth() + 1).padStart(2, '0')}`
      )
    );

    return Array.from(uniqueMonths)
      .sort((a, b) => a.localeCompare(b))
      .map((value) => {
        const [year, month] = value.split('-').map(Number);
        const label = new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
        return { value, label };
      });
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const status = (record.status ?? '').toLowerCase();
      if (completedOnly && status !== 'completed') {
        return false;
      }

      if (selectedMonth !== 'all') {
        const key = `${record.tripEnd.getFullYear()}-${String(record.tripEnd.getMonth() + 1).padStart(2, '0')}`;
        if (key !== selectedMonth) {
          return false;
        }
      }

      return true;
    });
  }, [completedOnly, records, selectedMonth]);

  const data: DashboardData | null = useMemo(() => {
    if (filteredRecords.length === 0) {
      return null;
    }
    return buildDashboardData(filteredRecords);
  }, [filteredRecords]);

  async function handleFile(file: File) {
    setError(null);
    setWarnings([]);
    setIsLoading(true);

    try {
      const parsed = await parseTuroCsv(file);
      setRecords(parsed.records);
      setSelectedMonth('all');
      setWarnings(parsed.warnings);
      setLastFileName(file.name);

      if (saveToSupabase) {
        const dashboard = buildDashboardData(parsed.records);
        await saveUploadToSupabase(file.name, parsed.records, dashboard);
      }
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <p className="eyebrow">Turo Codex</p>
        <h1>CSV to Business Insights</h1>
        <p className="subhead">Upload raw Turo export data and get KPI + trend insights immediately.</p>
      </header>

      <UploadZone onFileSelected={handleFile} isLoading={isLoading} />

      <section className="controls">
        <label>
          <input
            type="checkbox"
            checked={saveToSupabase}
            onChange={(event) => setSaveToSupabase(event.target.checked)}
          />
          Save this upload to Supabase
        </label>
        <small>
          {supabase
            ? 'Supabase is configured from environment variables.'
            : 'Supabase not configured yet. Local dashboard mode still works.'}
        </small>
      </section>

      {lastFileName ? <p className="status">Latest file: {lastFileName}</p> : null}

      {error ? <p className="error">{error}</p> : null}

      {warnings.length > 0 ? (
        <section className="warning-box">
          <h2>Rows Skipped</h2>
          <ul>
            {warnings.slice(0, 10).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
          {warnings.length > 10 ? <p>+{warnings.length - 10} more</p> : null}
        </section>
      ) : null}

      {records.length > 0 ? (
        <section className="filter-controls">
          <label>
            <input type="checkbox" checked={completedOnly} onChange={(event) => setCompletedOnly(event.target.checked)} />
            Completed trips only
          </label>
          <label>
            Month
            <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
              <option value="all">All months</option>
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </section>
      ) : null}

      {data ? <Dashboard data={data} /> : records.length > 0 ? <p className="status">No rows match current filters.</p> : null}
    </main>
  );
}
