import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import CopilotDrawer from './components/CopilotDrawer';
import Dashboard from './components/Dashboard';
import FeeSettingsPanel from './components/FeeSettingsPanel';
import MultiSelectFilter from './components/MultiSelectFilter';
import OwnerStatements from './components/OwnerStatements';
import ReimbursementForm, { type ReceiptPrefillSeed } from './components/ReimbursementForm';
import UploadZone from './components/UploadZone';
import { answerWithLocalCopilot, buildCopilotContext, hasMutationIntent, type CopilotAction, type CopilotMessage } from './lib/copilot';
import { parseTuroCsv } from './lib/csv';
import { loadFeeSettings, saveFeeSettings, toSplitRatios, type FeeSettings } from './lib/feeSettings';
import { buildDashboardData } from './lib/metrics';
import {
  getHistoricalRevenueSeries,
  getSupabaseSession,
  getUploadHistory,
  onSupabaseAuthStateChange,
  saveReceiptToSupabase,
  saveUploadToSupabase,
  signInWithEmail,
  signOutFromSupabase,
  supabase,
} from './lib/supabase';
import type { DashboardData, TuroTripRecord } from './lib/types';
import type { UploadHistoryItem } from './lib/supabase';

type AnalysisMode = 'ops' | 'accounting';
type AppView = 'dashboard' | 'statements' | 'settings';

type ReceiptInference = {
  inferredDate: string | null;
  inferredAmount: number | null;
  inferredDescription: string | null;
};

const REIMBURSEMENT_PREFILL_STORAGE_KEY = 'turo_reimbursement_prefill_seed_v1';

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

async function computeFileSha256Hex(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

function currency(value: number | null): string {
  if (value === null) return 'N/A';
  return value.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function isCompletedTrip(record: TuroTripRecord): boolean {
  return (record.status ?? '').trim().toLowerCase() === 'completed';
}

function inferReceiptFields(file: File): ReceiptInference {
  const name = file.name.toLowerCase();
  const dateMatch = name.match(/(20\d{2})[-_]?([01]\d)[-_]?([0-3]\d)/);
  const inferredDate = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : null;

  const amountMatch = file.name.match(/-?\$?\d+(?:\.\d{1,2})?/);
  const inferredAmount = amountMatch ? Number(amountMatch[0].replace('$', '')) : null;

  let inferredDescription: string | null = null;
  if (name.includes('lax') && name.includes('park')) inferredDescription = 'LAX Parking Reimbursement';
  else if (name.includes('lgb') && name.includes('park')) inferredDescription = 'LGB Parking Reimbursement';
  else if (name.includes('sna') && name.includes('park')) inferredDescription = 'SNA Parking Reimbursement';
  else if (name.includes('fuel') || name.includes('gas')) inferredDescription = 'Fuel Reimbursement';
  else if (name.includes('oil')) inferredDescription = 'Oil Change Fee';
  else if (name.includes('inspection')) inferredDescription = 'Turo Inspection Fee';
  else if (name.includes('wash')) inferredDescription = 'Car Wash Reimbursement';
  else if (name.includes('toll')) inferredDescription = 'Toll Reimbursement';
  else if (name.includes('ticket')) inferredDescription = 'Parking Ticket Reimbursement';

  return { inferredDate, inferredAmount: Number.isFinite(inferredAmount ?? NaN) ? inferredAmount : null, inferredDescription };
}

function readStoredReimbursementPrefill(): ReceiptPrefillSeed | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(REIMBURSEMENT_PREFILL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReceiptPrefillSeed;
    return parsed && typeof parsed.token === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredReimbursementPrefill(prefill: ReceiptPrefillSeed): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(REIMBURSEMENT_PREFILL_STORAGE_KEY, JSON.stringify(prefill));
}

function clearStoredReimbursementPrefill(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(REIMBURSEMENT_PREFILL_STORAGE_KEY);
}

function csvCell(value: string | number | null): string {
  const raw = value === null ? '' : String(value);
  return `"${raw.split('"').join('""')}"`;
}

function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function exportCurrentViewCsv(
  data: DashboardData,
  filteredRecords: TuroTripRecord[],
  selectedMonth: string,
  analysisMode: AnalysisMode
): string {
  const lines: string[] = [];
  lines.push('Report,Value');
  lines.push(`${csvCell('Generated At')},${csvCell(new Date().toISOString())}`);
  lines.push(`${csvCell('Mode')},${csvCell(analysisMode)}`);
  lines.push(`${csvCell('Selected Month')},${csvCell(selectedMonth)}`);
  lines.push(`${csvCell('Total Bookings')},${csvCell(data.metrics.totalBookings)}`);
  lines.push(`${csvCell('Total Earnings')},${csvCell(data.metrics.totalEarnings.toFixed(2))}`);
  lines.push(`${csvCell('LR Share')},${csvCell(data.metrics.lrShare.toFixed(2))}`);
  lines.push(`${csvCell('Owner Share')},${csvCell(data.metrics.ownerShare.toFixed(2))}`);
  lines.push('');
  lines.push('Owner,Vehicle,Bookings,Total Earnings,LR Share,Owner Share');
  for (const row of data.vehicleBreakdown) {
    lines.push(
      [
        csvCell(row.ownerName),
        csvCell(row.vehicle),
        csvCell(row.totalBookings),
        csvCell(row.totalEarnings.toFixed(2)),
        csvCell(row.lrShare.toFixed(2)),
        csvCell(row.ownerShare.toFixed(2)),
      ].join(',')
    );
  }
  lines.push('');
  lines.push('Trip End Date,Owner,Vehicle,Gross Revenue,LR Share,Owner Share,Status');
  for (const row of filteredRecords) {
    lines.push(
      [
        csvCell(row.tripEnd.toISOString().slice(0, 10)),
        csvCell(row.ownerName),
        csvCell(row.vehicleName),
        csvCell(row.grossRevenue.toFixed(2)),
        csvCell(row.lrShare.toFixed(2)),
        csvCell(row.ownerShare.toFixed(2)),
        csvCell(row.status ?? ''),
      ].join(',')
    );
  }
  return lines.join('\n');
}

function exportCurrentViewPdf(
  data: DashboardData,
  selectedMonth: string,
  selectedOwners: string[],
  selectedVehicles: string[],
  analysisMode: AnalysisMode
): void {
  const rows = data.vehicleBreakdown.slice(0, 25);
  const ownerFilter = selectedOwners.length > 0 ? selectedOwners.join(', ') : 'All owners';
  const vehicleFilter = selectedVehicles.length > 0 ? selectedVehicles.join(', ') : 'All vehicles';
  const monthFilter = selectedMonth === 'all' ? 'All months' : selectedMonth;

  const html = `
    <html>
      <head>
        <title>Turo Codex Export</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #102a43; }
          h1 { margin: 0 0 12px; }
          h2 { margin: 20px 0 8px; font-size: 18px; }
          .meta { margin: 0 0 6px; color: #334e68; }
          .kpi { margin: 0 0 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
          th, td { border: 1px solid #d9e2ec; text-align: left; padding: 6px; }
          th { background: #f0f4f8; }
        </style>
      </head>
      <body>
        <h1>Turo Codex - Current View Export</h1>
        <p class="meta">Generated: ${escapeHtml(new Date().toLocaleString())}</p>
        <p class="meta">Mode: ${escapeHtml(analysisMode)}</p>
        <p class="meta">Month: ${escapeHtml(monthFilter)}</p>
        <p class="meta">Owners: ${escapeHtml(ownerFilter)}</p>
        <p class="meta">Vehicles: ${escapeHtml(vehicleFilter)}</p>

        <h2>Key Metrics</h2>
        <p class="kpi">Bookings: ${data.metrics.totalBookings.toLocaleString()}</p>
        <p class="kpi">Total Earnings: ${data.metrics.totalEarnings.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</p>
        <p class="kpi">LR Share: ${data.metrics.lrShare.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</p>
        <p class="kpi">Owner Share: ${data.metrics.ownerShare.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</p>

        <h2>Top 25 Vehicles by Earnings</h2>
        <table>
          <thead>
            <tr>
              <th>Owner</th>
              <th>Vehicle</th>
              <th>Bookings</th>
              <th>Total Earnings</th>
              <th>LR Share</th>
              <th>Owner Share</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (row) => `<tr>
                  <td>${escapeHtml(row.ownerName)}</td>
                  <td>${escapeHtml(row.vehicle)}</td>
                  <td>${row.totalBookings}</td>
                  <td>${row.totalEarnings.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</td>
                  <td>${row.lrShare.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</td>
                  <td>${row.ownerShare.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </body>
    </html>
  `;

  const blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const reportWindow = window.open(blobUrl, '_blank', 'noopener,noreferrer');
  if (!reportWindow) {
    URL.revokeObjectURL(blobUrl);
    throw new Error('Popup blocked. Allow popups to export PDF.');
  }
  reportWindow.addEventListener(
    'load',
    () => {
      reportWindow.focus();
      reportWindow.print();
      URL.revokeObjectURL(blobUrl);
    },
    { once: true }
  );
}

export default function App() {
  const isReimbursementOnlyView =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('view') === 'reimbursement';
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
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('ops');
  const [appView, setAppView] = useState<AppView>('dashboard');
  const [dataSource, setDataSource] = useState<'currentUpload' | 'supabaseHistory'>('currentUpload');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [uploadHistory, setUploadHistory] = useState<UploadHistoryItem[]>([]);
  const [selectedHistoryUploadId, setSelectedHistoryUploadId] = useState<string | null>(null);
  const [historicalRevenueSeries, setHistoricalRevenueSeries] = useState<Array<{ label: string; revenue: number }>>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [feeSettings, setFeeSettings] = useState<FeeSettings>(() => loadFeeSettings());
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [copilotInput, setCopilotInput] = useState('');
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [receiptUploadLoading, setReceiptUploadLoading] = useState(false);
  const [receiptPrefillSeed, setReceiptPrefillSeed] = useState<ReceiptPrefillSeed | null>(() =>
    readStoredReimbursementPrefill()
  );
  const [copilotMessages, setCopilotMessages] = useState<CopilotMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Copilot is ready in free read-only mode. Ask about the current view, or export CSV/PDF.',
      citations: ['guardrails'],
    },
  ]);

  const modeRecords = useMemo(() => {
    if (analysisMode === 'ops') {
      return records.filter(isCompletedTrip);
    }
    return records;
  }, [analysisMode, records]);

  const monthOptions = useMemo(() => {
    const uniqueMonths = new Set(
      modeRecords.map((record) =>
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
  }, [modeRecords]);

  const ownerOptions = useMemo(() => {
    const owners = new Set(modeRecords.map((record) => record.ownerName));
    return Array.from(owners).sort((a, b) => a.localeCompare(b));
  }, [modeRecords]);

  const vehicleOptions = useMemo(() => {
    const vehicles = modeRecords
      .filter((record) => selectedOwners.length === 0 || selectedOwners.includes(record.ownerName))
      .map((record) => record.vehicleName);
    return Array.from(new Set(vehicles)).sort((a, b) => a.localeCompare(b));
  }, [modeRecords, selectedOwners]);

  const filteredRecords = useMemo(() => {
    return modeRecords.filter((record) => {
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
  }, [modeRecords, selectedMonth, selectedOwners, selectedVehicles]);

  const recordsForMetrics = useMemo(() => {
    if (analysisMode === 'ops') {
      return filteredRecords;
    }
    return filteredRecords.map((record) => ({
      ...record,
      lrShare: record.legacyLrShare,
      ownerShare: record.legacyOwnerShare,
    }));
  }, [analysisMode, filteredRecords]);

  const data: DashboardData | null = useMemo(() => {
    if (recordsForMetrics.length === 0) {
      return null;
    }
    return buildDashboardData(recordsForMetrics);
  }, [recordsForMetrics]);
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

  const copilotContext = useMemo(() => {
    if (dataSource !== 'currentUpload' || !data) {
      return null;
    }
    return buildCopilotContext({
      data,
      dataSource,
      mode: analysisMode,
      selectedMonth,
      selectedOwners,
      selectedVehicles,
      revenueSeries,
    });
  }, [analysisMode, data, dataSource, revenueSeries, selectedMonth, selectedOwners, selectedVehicles]);

  const revenueTitle = selectedMonth === 'all' ? 'Monthly Revenue Trend' : 'Daily Revenue Trend (Selected Month)';
  const sharePolicyLabel =
    analysisMode === 'ops'
      ? 'the current allocation policy on completed trips'
      : 'the legacy allocation policy across all statuses';
  const isSignedIn = Boolean(session);
  const supabaseModeMessage = !supabase
    ? 'Supabase not configured yet. Local dashboard mode still works.'
    : !isSignedIn
      ? 'Sign in to enable Supabase save/history. Uploads currently run in local-only mode.'
      : saveToSupabase
        ? 'Supabase save is enabled for new uploads.'
        : 'Supabase save is off. New uploads will be local-only unless you check the box.';

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      if (!supabase) return;
      try {
        const currentSession = await getSupabaseSession();
        if (!cancelled) {
          setSession(currentSession);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setAuthError(getErrorMessage(caughtError));
        }
      }
    }

    void loadSession();
    const unsubscribe = onSupabaseAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setAuthError(null);
      if (event === 'SIGNED_IN') {
        setSaveToSupabase(true);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (isSignedIn) {
      return;
    }
    setSaveToSupabase(false);
    if (dataSource === 'supabaseHistory') {
      setDataSource('currentUpload');
    }
  }, [dataSource, isSignedIn]);

  useEffect(() => {
    if (dataSource !== 'supabaseHistory' || !supabase || !isSignedIn) {
      return;
    }

    let cancelled = false;
    async function loadHistory() {
      setHistoryError(null);
      setHistoryLoading(true);
      try {
        const uploads = await getUploadHistory(40);
        if (cancelled) return;
        setUploadHistory(uploads);
        setSelectedHistoryUploadId((current) => current ?? uploads[0]?.id ?? null);
      } catch (caughtError) {
        if (!cancelled) {
          setHistoryError(getErrorMessage(caughtError));
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    }

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [dataSource, isSignedIn]);

  useEffect(() => {
    if (dataSource !== 'supabaseHistory' || !selectedHistoryUploadId || !supabase || !isSignedIn) {
      setHistoricalRevenueSeries([]);
      return;
    }
    const uploadId = selectedHistoryUploadId;

    let cancelled = false;
    async function loadRevenueSeries() {
      setHistoryError(null);
      setHistoryLoading(true);
      try {
        const series = await getHistoricalRevenueSeries(uploadId);
        if (!cancelled) {
          setHistoricalRevenueSeries(series);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setHistoryError(getErrorMessage(caughtError));
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    }

    void loadRevenueSeries();
    return () => {
      cancelled = true;
    };
  }, [dataSource, isSignedIn, selectedHistoryUploadId]);

  async function handleFile(file: File) {
    setError(null);
    setInfo(null);
    setWarnings([]);
    setIsLoading(true);

    try {
      const parsed = await parseTuroCsv(file, toSplitRatios(feeSettings));
      setRecords(parsed.records);
      setSelectedMonth('all');
      setSelectedOwners([]);
      setSelectedVehicles([]);
      setWarnings(parsed.warnings);
      setLastFileName(file.name);

      if (saveToSupabase) {
        if (!isSignedIn) {
          throw new Error('Sign in to save uploads to Supabase.');
        }
        const completedOnlyRecords = parsed.records.filter(isCompletedTrip);
        const dashboard = buildDashboardData(completedOnlyRecords);
        const fileHashHex = await computeFileSha256Hex(file);
        const result = await saveUploadToSupabase(file.name, parsed.records, dashboard, fileHashHex);
        setInfo(
          result.duplicateUpload
            ? 'This exact file is already stored in Supabase. Duplicate rows were skipped.'
            : 'Saved to Supabase successfully.'
        );
      } else {
        setInfo('CSV processed locally only. Turn on "Save this upload to Supabase" to persist rows.');
      }
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setIsLoading(false);
    }
  }

  function addCopilotMessage(message: CopilotMessage): void {
    setCopilotMessages((current) => [...current, message]);
  }

  function openReimbursementWindow(prefillSeed: ReceiptPrefillSeed): void {
    writeStoredReimbursementPrefill(prefillSeed);
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'reimbursement');
    const popup = window.open(url.toString(), '_blank', 'noopener,noreferrer,width=1180,height=920');
    if (!popup) {
      setError('Popup blocked. Allow popups to open the reimbursement form.');
      return;
    }
    popup.focus();
  }

  function handleCopilotAction(action: CopilotAction): void {
    if (!data || dataSource !== 'currentUpload') {
      setError('Copilot export is available only in current upload mode with active data.');
      return;
    }
    try {
      if (action.type === 'export_csv') {
        const csv = exportCurrentViewCsv(data, filteredRecords, selectedMonth, analysisMode);
        downloadFile(`turo-current-view-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8');
        setInfo('Exported CSV for the current filtered view.');
      } else {
        exportCurrentViewPdf(data, selectedMonth, selectedOwners, selectedVehicles, analysisMode);
        setInfo('Opened print dialog for PDF export.');
      }
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    }
  }

  function submitCopilotQuestion(questionFromInput?: string): void {
    const question = (questionFromInput ?? copilotInput).trim();
    if (!question) return;

    addCopilotMessage({
      id: `u-${Date.now()}`,
      role: 'user',
      text: question,
    });
    setCopilotInput('');

    if (dataSource !== 'currentUpload') {
      addCopilotMessage({
        id: `a-${Date.now()}-history`,
        role: 'assistant',
        text: 'Copilot free mode currently supports current upload mode only. Switch data source to current upload.',
        citations: ['guardrails'],
      });
      return;
    }

    if (!copilotContext) {
      addCopilotMessage({
        id: `a-${Date.now()}-empty`,
        role: 'assistant',
        text: 'Upload a CSV and select a view first, then I can answer using the current filtered dashboard data.',
        citations: ['guardrails'],
      });
      return;
    }

    setCopilotLoading(true);
    window.setTimeout(() => {
      const response = answerWithLocalCopilot(question, copilotContext);
      addCopilotMessage({
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: response.text,
        citations: response.citations,
        actions: response.actions,
      });

      if (hasMutationIntent(question)) {
        setInfo('Copilot blocked a write/mutation request because read-only mode is enabled.');
      }
      setCopilotLoading(false);
    }, 120);
  }

  async function handleReceiptSelection(files: FileList): Promise<void> {
    if (!supabase || !isSignedIn) {
      setError('Sign in to Supabase before uploading receipts.');
      return;
    }

    setError(null);
    setInfo(null);
    setReceiptUploadLoading(true);
    let successCount = 0;
    const uploadedDocumentIds: string[] = [];
    const fileNames: string[] = [];
    let combinedInference: ReceiptInference = {
      inferredDate: null,
      inferredAmount: null,
      inferredDescription: null,
    };

    try {
      for (const file of Array.from(files)) {
        const upload = await saveReceiptToSupabase(file, 'receipt');
        uploadedDocumentIds.push(upload.documentId);
        fileNames.push(file.name);
        const inferred = inferReceiptFields(file);
        combinedInference = {
          inferredDate: combinedInference.inferredDate ?? inferred.inferredDate,
          inferredAmount: combinedInference.inferredAmount ?? inferred.inferredAmount,
          inferredDescription: combinedInference.inferredDescription ?? inferred.inferredDescription,
        };
        successCount += 1;
      }
      setInfo(`Uploaded ${successCount} receipt${successCount === 1 ? '' : 's'} successfully.`);
      const nextPrefillSeed: ReceiptPrefillSeed = {
        token: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        documentIds: uploadedDocumentIds,
        inferredDate: combinedInference.inferredDate,
        inferredAmount: combinedInference.inferredAmount,
        inferredDescription: combinedInference.inferredDescription,
        sourceFileNames: fileNames,
      };
      setReceiptPrefillSeed(nextPrefillSeed);
      openReimbursementWindow(nextPrefillSeed);
      addCopilotMessage({
        id: `a-${Date.now()}-receipt-upload`,
        role: 'assistant',
        text: `Uploaded ${successCount} file${successCount === 1 ? '' : 's'} to receipt storage and opened the reimbursement form with prefill.`,
        citations: ['documents', 'storage.receipts'],
      });
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setReceiptUploadLoading(false);
    }
  }

  if (isReimbursementOnlyView) {
    return (
      <main className="app-shell">
        <header className="app-header">
          <p className="eyebrow">Turo Codex</p>
          <h1>Reimbursement Form</h1>
          <p className="subhead">Standalone reimbursement window. You can keep this open while reviewing dashboards.</p>
        </header>

        {supabase ? null : (
          <p className="error">
            Supabase is not configured. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to enable form saves.
          </p>
        )}

        <ReimbursementForm
          isSignedIn={isSignedIn}
          prefillSeed={receiptPrefillSeed}
          onClearPrefillSeed={() => {
            setReceiptPrefillSeed(null);
            clearStoredReimbursementPrefill();
          }}
        />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <p className="eyebrow">Turo Codex</p>
        <h1>CSV to Business Insights</h1>
        <p className="subhead">Upload raw Turo export data and get KPI + trend insights immediately.</p>
      </header>
      <CopilotDrawer
        isOpen={isCopilotOpen}
        inputValue={copilotInput}
        messages={copilotMessages}
        isLoading={copilotLoading}
        onToggle={() => setIsCopilotOpen((current) => !current)}
        onInputChange={setCopilotInput}
        onSubmit={() => submitCopilotQuestion()}
        onQuickPrompt={(prompt) => submitCopilotQuestion(prompt)}
        onAction={handleCopilotAction}
        onClear={() =>
          setCopilotMessages([
            {
              id: `welcome-${Date.now()}`,
              role: 'assistant',
              text: 'Copilot is reset. Ask a question about the current filtered view.',
              citations: ['guardrails'],
            },
          ])
        }
        onReceiptsSelected={(files) => {
          void handleReceiptSelection(files);
        }}
        onOpenReimbursementForm={() =>
          openReimbursementWindow({
            token: `${Date.now()}-manual-open`,
            documentIds: [],
            inferredDate: null,
            inferredAmount: null,
            inferredDescription: null,
            sourceFileNames: [],
          })
        }
        receiptUploadLoading={receiptUploadLoading}
        receiptUploadDisabled={!supabase || !isSignedIn}
      />

      {supabase ? (
        <section className="auth-panel">
          <h2>Supabase Access</h2>
          {isSignedIn ? (
            <div className="auth-signed-in">
              <p>Signed in as {session?.user.email}</p>
              <button
                type="button"
                onClick={async () => {
                  setAuthError(null);
                  setAuthLoading(true);
                  try {
                    await signOutFromSupabase();
                    setInfo('Signed out. Local CSV mode is still available.');
                  } catch (caughtError) {
                    setAuthError(getErrorMessage(caughtError));
                  } finally {
                    setAuthLoading(false);
                  }
                }}
                disabled={authLoading}
              >
                Sign out
              </button>
            </div>
          ) : (
            <form
              className="auth-form"
              onSubmit={async (event) => {
                event.preventDefault();
                setAuthError(null);
                setAuthLoading(true);
                try {
                  await signInWithEmail(authEmail.trim(), authPassword);
                  setInfo('Signed in. You can now save uploads and view Supabase history.');
                  setAuthPassword('');
                } catch (caughtError) {
                  setAuthError(getErrorMessage(caughtError));
                } finally {
                  setAuthLoading(false);
                }
              }}
            >
              <label>
                Email
                <input
                  type="email"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              <button type="submit" disabled={authLoading}>
                {authLoading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
          )}
          {authError ? <p className="error">{authError}</p> : null}
          {!isSignedIn ? <small>Sign in is required for Supabase save/history. Local CSV analysis remains available.</small> : null}
        </section>
      ) : null}

      <UploadZone onFileSelected={handleFile} isLoading={isLoading} />

      <section className="controls">
        <label>
          <input
            type="radio"
            name="dataSource"
            checked={dataSource === 'currentUpload'}
            onChange={() => setDataSource('currentUpload')}
          />
          Current upload mode
        </label>
        <label>
          <input
            type="radio"
            name="dataSource"
            checked={dataSource === 'supabaseHistory'}
            onChange={() => setDataSource('supabaseHistory')}
            disabled={!supabase || !isSignedIn}
          />
          Supabase history mode
        </label>
        <label>
          <input
            type="checkbox"
            checked={saveToSupabase}
            onChange={(event) => setSaveToSupabase(event.target.checked)}
            disabled={!isSignedIn}
          />
          Save this upload to Supabase
        </label>
        <small>{supabaseModeMessage}</small>
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

      <div className="app-nav-tabs">
        {records.length > 0 && (
          <>
            <button
              type="button"
              className={appView === 'dashboard' ? 'tab-button active' : 'tab-button'}
              onClick={() => setAppView('dashboard')}
            >
              Dashboard
            </button>
            <button
              type="button"
              className={appView === 'statements' ? 'tab-button active' : 'tab-button'}
              onClick={() => setAppView('statements')}
            >
              Statements
            </button>
          </>
        )}
        <button
          type="button"
          className={appView === 'settings' ? 'tab-button active' : 'tab-button'}
          onClick={() => setAppView('settings')}
        >
          ⚙ Fee Settings
        </button>
      </div>

      {dataSource === 'supabaseHistory' ? (
        <section className="history-panel">
          <div className="history-header">
            <h2>Historical Uploads</h2>
            <button
              type="button"
              onClick={async () => {
                setHistoryError(null);
                setHistoryLoading(true);
                try {
                  const uploads = await getUploadHistory(40);
                  setUploadHistory(uploads);
                  setSelectedHistoryUploadId((current) => current ?? uploads[0]?.id ?? null);
                } catch (caughtError) {
                  setHistoryError(getErrorMessage(caughtError));
                } finally {
                  setHistoryLoading(false);
                }
              }}
              disabled={!supabase || historyLoading}
            >
              Refresh history
            </button>
          </div>

          {historyError ? <p className="error">{historyError}</p> : null}
          {historyLoading ? <p className="status">Loading historical data...</p> : null}

          <div className="history-grid">
            <article className="table-card">
              <h3>Uploads</h3>
              {uploadHistory.length === 0 ? (
                <p className="status">No uploads found.</p>
              ) : (
                <ul className="history-upload-list">
                  {uploadHistory.map((upload) => (
                    <li key={upload.id}>
                      <button
                        type="button"
                        className={selectedHistoryUploadId === upload.id ? 'history-upload-button active' : 'history-upload-button'}
                        onClick={() => setSelectedHistoryUploadId(upload.id)}
                      >
                        <span>{upload.fileName}</span>
                        <small>
                          {new Date(upload.createdAt).toLocaleString()} | Trips: {upload.totalTrips} | Gross:{' '}
                          {currency(upload.grossRevenue)}
                        </small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="chart-card">
              <h3>Historical Daily Revenue</h3>
              {historicalRevenueSeries.length === 0 ? (
                <p className="status">Select an upload to view its stored trip revenue trend.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={historicalRevenueSeries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="revenue" stroke="#0b6e4f" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </article>
          </div>
        </section>
      ) : null}

      {appView === 'dashboard' && dataSource === 'currentUpload' && records.length > 0 ? (
        <section className="filter-controls">
          <label>
            <input
              type="radio"
              name="analysisMode"
              checked={analysisMode === 'ops'}
              onChange={() => setAnalysisMode('ops')}
            />
            Ops mode
          </label>
          <label>
            <input
              type="radio"
              name="analysisMode"
              checked={analysisMode === 'accounting'}
              onChange={() => setAnalysisMode('accounting')}
            />
            Accounting mode
          </label>
          <p className="filter-note">
            {analysisMode === 'ops'
              ? 'Ops mode: completed trips only, current allocation policy.'
              : 'Accounting mode: all statuses, legacy allocation policy.'}
          </p>
          <MultiSelectFilter
            label="Owner"
            options={ownerOptions}
            selectedValues={selectedOwners}
            onChange={(nextOwners) => {
              setSelectedOwners(nextOwners);
              setSelectedVehicles((currentVehicles) =>
                currentVehicles.filter((vehicle) =>
                  modeRecords.some((record) =>
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

      {appView === 'dashboard' && dataSource === 'currentUpload' && data ? (
        <Dashboard
          data={data}
          revenueSeries={revenueSeries}
          revenueTitle={revenueTitle}
          sharePolicyLabel={sharePolicyLabel}
        />
      ) : appView === 'dashboard' && dataSource === 'currentUpload' && records.length > 0 ? (
        <p className="status">No rows match current filters.</p>
      ) : null}

      {appView === 'statements' && (
        <OwnerStatements
          records={modeRecords}
          isSignedIn={isSignedIn}
          session={session}
        />
      )}

      {appView === 'settings' && (
        <FeeSettingsPanel
          settings={feeSettings}
          onSettingsChange={(next) => {
            setFeeSettings(next);
            saveFeeSettings(next);
          }}
        />
      )}
    </main>
  );
}
