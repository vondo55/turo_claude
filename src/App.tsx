import { useMemo, useState } from 'react';
import Dashboard from './components/Dashboard';
import MultiSelectFilter from './components/MultiSelectFilter';
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
  const [info, setInfo] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saveToSupabase, setSaveToSupabase] = useState(false);
  const [lastFileName, setLastFileName] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [selectedOwners, setSelectedOwners] = useState<string[]>([]);
  const [selectedVehicles, setSelectedVehicles] = useState<string[]>([]);

  const completedRecords = useMemo(() => {
    return records.filter((record) => (record.status ?? '').trim().toLowerCase() === 'completed');
  }, [records]);

  const monthOptions = useMemo(() => {
    const uniqueMonths = new Set(
      completedRecords.map((record) =>
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
  }, [completedRecords]);

  const ownerOptions = useMemo(() => {
    const owners = new Set(completedRecords.map((record) => record.ownerName));
    return Array.from(owners).sort((a, b) => a.localeCompare(b));
  }, [completedRecords]);

  const vehicleOptions = useMemo(() => {
    const vehicles = completedRecords
      .filter((record) => selectedOwners.length === 0 || selectedOwners.includes(record.ownerName))
      .map((record) => record.vehicleName);
    return Array.from(new Set(vehicles)).sort((a, b) => a.localeCompare(b));
  }, [completedRecords, selectedOwners]);

  const filteredRecords = useMemo(() => {
    return completedRecords.filter((record) => {
      if (selectedMonth !== 'all') {
        const key = `${record.tripEnd.getFullYear()}-${String(record.tripEnd.getMonth() + 1).padStart(2, '0')}`;
        if (key !== selectedMonth) {
          return false;
        }
      }

      if (selectedOwners.length > 0 && !selectedOwners.includes(record.ownerName)) {
        return false;
      }

      if (selectedVehicles.length > 0 && !selectedVehicles.includes(record.vehicleName)) {
        return false;
      }

      return true;
    });
  }, [completedRecords, selectedMonth, selectedOwners, selectedVehicles]);

  const data: DashboardData | null = useMemo(() => {
    if (filteredRecords.length === 0) {
      return null;
    }
    return buildDashboardData(filteredRecords);
  }, [filteredRecords]);

  const revenueSeries = useMemo(() => {
    if (selectedMonth === 'all') {
      return data?.monthlyRevenue.map((row) => ({ label: row.month, revenue: row.revenue })) ?? [];
    }

    const byDay = new Map<string, number>();
    for (const row of filteredRecords) {
      const key = row.tripEnd.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + row.grossRevenue);
    }

    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, revenue]) => ({
        label: new Date(`${key}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        revenue: Number(revenue.toFixed(2)),
      }));
  }, [data, filteredRecords, selectedMonth]);

  const revenueTitle = selectedMonth === 'all' ? 'Monthly Revenue Trend' : 'Daily Revenue Trend (Selected Month)';

  async function handleFile(file: File) {
    setError(null);
    setInfo(null);
    setWarnings([]);
    setIsLoading(true);

    try {
      const parsed = await parseTuroCsv(file);
      setRecords(parsed.records);
      setSelectedMonth('all');
      setSelectedOwners([]);
      setSelectedVehicles([]);
      setWarnings(parsed.warnings);
      setLastFileName(file.name);

      if (saveToSupabase) {
        const completedOnlyRecords = parsed.records.filter(
          (record) => (record.status ?? '').trim().toLowerCase() === 'completed'
        );
        const dashboard = buildDashboardData(completedOnlyRecords);
        const result = await saveUploadToSupabase(file.name, parsed.records, dashboard);
        setInfo(
          result.duplicateUpload
            ? result.tripsRecovered
              ? 'This file already existed in uploads. Missing trip rows were recovered.'
              : 'This file is already stored in Supabase. Duplicate rows were skipped.'
            : 'Saved to Supabase successfully.'
        );
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
      {info ? <p className="status">{info}</p> : null}

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
          <p className="filter-note">Completed trips only</p>
          <MultiSelectFilter
            label="Owner"
            options={ownerOptions}
            selectedValues={selectedOwners}
            onChange={(nextOwners) => {
              setSelectedOwners(nextOwners);
              setSelectedVehicles((currentVehicles) =>
                currentVehicles.filter((vehicle) =>
                  completedRecords.some((record) =>
                    nextOwners.length === 0
                      ? record.vehicleName === vehicle
                      : record.vehicleName === vehicle && nextOwners.includes(record.ownerName)
                  )
                )
              );
            }}
            placeholder="All owners"
          />
          <MultiSelectFilter
            label="Vehicle"
            options={vehicleOptions}
            selectedValues={selectedVehicles}
            onChange={setSelectedVehicles}
            placeholder="All vehicles"
          />
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

      {data ? (
        <Dashboard data={data} revenueSeries={revenueSeries} revenueTitle={revenueTitle} />
      ) : records.length > 0 ? (
        <p className="status">No rows match current filters.</p>
      ) : null}
    </main>
  );
}
