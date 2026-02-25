import { createClient } from '@supabase/supabase-js';
import type { Session } from '@supabase/supabase-js';
import type { DashboardData, TuroTripRecord } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const supabaseClientKey = supabasePublishableKey ?? supabaseAnonKey;

export const supabase =
  supabaseUrl && supabaseClientKey ? createClient(supabaseUrl, supabaseClientKey) : null;

type SupabaseErrorLike = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

type SaveUploadResult = {
  duplicateUpload: boolean;
};

type DocumentType = 'receipt' | 'trip_screenshot' | 'other';

type ReceiptUploadResult = {
  documentId: string;
  storagePath: string;
};

export type SaveExpenseSubmissionInput = {
  requesterName: string;
  expenseDate: string;
  amount: number;
  errandAmount: number | null;
  description: string;
  paidPersonalCard: boolean;
  vehicle: string;
  receiptDocumentIds: string[];
  metadata?: Record<string, unknown> | null;
};

export type ExpenseSubmissionHistoryItem = {
  id: string;
  createdAt: string;
  requesterName: string;
  expenseDate: string;
  amount: number;
  description: string;
  vehicle: string;
  receiptDocumentIds: string[];
};

export type UploadHistoryItem = {
  id: string;
  createdAt: string;
  fileName: string;
  totalTrips: number;
  grossRevenue: number;
  netEarnings: number | null;
  cancellationRate: number;
};

type HistoricalTripRow = {
  upload_id: string;
  row_number: number;
  trip_end: string;
  status: string | null;
  gross_revenue: number;
};

type ExistingTripStatusRow = {
  trip_fingerprint: string;
  status: string | null;
};

type AuthStateCallback = (event: string, session: Session | null) => void;

function formatSupabaseError(error: SupabaseErrorLike, fallback: string) {
  const parts = [error.message, error.details, error.hint].filter(Boolean);
  const base = parts.length > 0 ? parts.join(' | ') : fallback;
  return error.code ? `${base} (code: ${error.code})` : base;
}

function formatUuidFromBytes(bytes: Uint8Array) {
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function buildUploadIdFromFileHash(fileHashHex: string) {
  const normalized = fileHashHex.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error('Invalid file hash. Expected SHA-256 hex string.');
  }

  const bytes = new Uint8Array(16);
  for (let index = 0; index < 16; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return formatUuidFromBytes(bytes);
}

function buildUploadIdFromUserScopedFileHash(userId: string, fileHashHex: string) {
  const userHashHex = userId.replace(/-/g, '').toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(userHashHex)) {
    throw new Error('Invalid user id format for upload key derivation.');
  }
  return buildUploadIdFromFileHash(`${userHashHex}${fileHashHex.slice(32)}`);
}

function normalizeFingerprintValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function isCompletedStatus(status: string | null | undefined) {
  return (status ?? '').trim().toLowerCase() === 'completed';
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function buildTripFingerprint(row: TuroTripRecord) {
  const identityGuest = row.guestName === 'Unknown guest' ? row.ownerName : row.guestName;
  const fingerprintBase = [
    normalizeFingerprintValue(row.vehicleName),
    normalizeFingerprintValue(identityGuest),
    row.tripStart.toISOString(),
    row.tripEnd.toISOString(),
  ].join('|');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprintBase));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

async function getCurrentUserId() {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY).'
    );
  }
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    throw new Error(formatSupabaseError(error, 'Failed to get authenticated user.'));
  }
  if (!data.user) {
    throw new Error('You must sign in before using Supabase persistence.');
  }
  return data.user.id;
}

async function computeFileSha256Hex(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function saveReceiptToSupabase(
  file: File,
  docType: DocumentType = 'receipt'
): Promise<ReceiptUploadResult> {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY).'
    );
  }

  const userId = await getCurrentUserId();
  const safeFileName = sanitizeFileName(file.name);
  const storagePath = `${userId}/${Date.now()}-${crypto.randomUUID()}-${safeFileName}`;
  const sha256 = await computeFileSha256Hex(file);

  const { error: storageError } = await supabase.storage.from('receipts').upload(storagePath, file, {
    upsert: false,
    contentType: file.type || undefined,
  });

  if (storageError) {
    throw new Error(formatSupabaseError(storageError, 'Failed to upload receipt to storage.'));
  }

  const { data: insertedDocument, error: documentsError } = await supabase
    .from('documents')
    .insert({
      uploaded_by: userId,
      doc_type: docType,
      storage_path: storagePath,
      original_filename: file.name,
      mime_type: file.type || null,
      file_size_bytes: file.size,
      sha256,
    })
    .select('id')
    .single();

  if (documentsError) {
    await supabase.storage.from('receipts').remove([storagePath]);
    throw new Error(formatSupabaseError(documentsError, 'Failed to insert documents row for receipt upload.'));
  }

  return {
    documentId: insertedDocument.id as string,
    storagePath,
  };
}

export async function saveUploadToSupabase(
  fileName: string,
  records: TuroTripRecord[],
  dashboard: DashboardData,
  fileHashHex: string
): Promise<SaveUploadResult> {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY).'
    );
  }

  const userId = await getCurrentUserId();
  const uploadId = buildUploadIdFromUserScopedFileHash(userId, fileHashHex);

  const { error: uploadError } = await supabase
    .from('uploads')
    .insert({
      id: uploadId,
      file_name: fileName,
      total_trips: dashboard.metrics.totalTrips,
      gross_revenue: dashboard.metrics.grossRevenue,
      net_earnings: dashboard.metrics.netEarnings,
      cancellation_rate: dashboard.metrics.cancellationRate,
    });

  const duplicateUpload = uploadError?.code === '23505';
  if (uploadError) {
    if (!duplicateUpload) {
      throw new Error(formatSupabaseError(uploadError, 'Failed to insert upload row.'));
    }
  }

  const tripFingerprints = await Promise.all(records.map((row) => buildTripFingerprint(row)));
  const rowsWithFingerprints = records.map((row, index) => ({ ...row, tripFingerprint: tripFingerprints[index] }));

  const existingStatuses: ExistingTripStatusRow[] = [];
  const fingerprintChunks = chunk(tripFingerprints, 200);
  for (const fingerprintChunk of fingerprintChunks) {
    const { data, error } = await supabase
      .from('trips')
      .select('trip_fingerprint, status')
      .in('trip_fingerprint', fingerprintChunk)
      .returns<ExistingTripStatusRow[]>();

    if (error) {
      throw new Error(formatSupabaseError(error, 'Failed to evaluate existing trip statuses.'));
    }
    if (data) {
      existingStatuses.push(...data);
    }
  }

  const completedFingerprints = new Set(
    (existingStatuses ?? []).filter((row) => isCompletedStatus(row.status)).map((row) => row.trip_fingerprint)
  );

  const upsertRows = rowsWithFingerprints.filter((entry) => !completedFingerprints.has(entry.tripFingerprint));

  if (upsertRows.length === 0) {
    return { duplicateUpload };
  }

  const dedupedByFingerprint = new Map<string, (typeof upsertRows)[number]>();
  for (const row of upsertRows) {
    const current = dedupedByFingerprint.get(row.tripFingerprint);
    if (!current) {
      dedupedByFingerprint.set(row.tripFingerprint, row);
      continue;
    }

    if (isCompletedStatus(row.status) && !isCompletedStatus(current.status)) {
      dedupedByFingerprint.set(row.tripFingerprint, row);
      continue;
    }

    if (row.rowNumber > current.rowNumber) {
      dedupedByFingerprint.set(row.tripFingerprint, row);
    }
  }

  const dedupedRows = Array.from(dedupedByFingerprint.values());

  const tripsPayload = dedupedRows.map((entry) => ({
    user_id: userId,
    upload_id: uploadId,
    row_number: entry.rowNumber,
    trip_start: entry.tripStart.toISOString(),
    trip_end: entry.tripEnd.toISOString(),
    vehicle_name: entry.vehicleName,
    guest_name: entry.guestName,
    gross_revenue: entry.grossRevenue,
    net_earnings: entry.netEarnings,
    addons_revenue: entry.addonsRevenue,
    is_cancelled: entry.isCancelled,
    status: entry.status,
    trip_fingerprint: entry.tripFingerprint,
  }));

  const payloadChunks = chunk(tripsPayload, 200);
  for (const payloadChunk of payloadChunks) {
    const { error: tripsError } = await supabase.from('trips').upsert(payloadChunk, {
      onConflict: 'user_id,trip_fingerprint',
    });

    if (tripsError) {
      throw new Error(formatSupabaseError(tripsError, 'Failed to insert trip rows.'));
    }
  }

  return { duplicateUpload };
}

export async function saveExpenseSubmissionToSupabase(input: SaveExpenseSubmissionInput) {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY).'
    );
  }

  const userId = await getCurrentUserId();
  const { error } = await supabase.from('expense_submissions').insert({
    user_id: userId,
    requester_name: input.requesterName,
    expense_date: input.expenseDate,
    amount: input.amount,
    errand_amount: input.errandAmount,
    description: input.description,
    paid_personal_card: input.paidPersonalCard,
    vehicle: input.vehicle,
    receipt_document_ids: input.receiptDocumentIds,
    metadata: input.metadata ?? {},
  });

  if (error) {
    throw new Error(formatSupabaseError(error, 'Failed to save expense submission.'));
  }
}

export async function getExpenseSubmissionHistory(limit = 25): Promise<ExpenseSubmissionHistoryItem[]> {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY).'
    );
  }

  const { data, error } = await supabase
    .from('expense_submissions')
    .select('id, created_at, requester_name, expense_date, amount, description, vehicle, receipt_document_ids')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(formatSupabaseError(error, 'Failed to load expense submissions.'));
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    createdAt: row.created_at as string,
    requesterName: row.requester_name as string,
    expenseDate: row.expense_date as string,
    amount: Number(row.amount),
    description: row.description as string,
    vehicle: row.vehicle as string,
    receiptDocumentIds: Array.isArray(row.receipt_document_ids)
      ? (row.receipt_document_ids as string[])
      : [],
  }));
}

export async function signInWithEmail(email: string, password: string) {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY).'
    );
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(formatSupabaseError(error, 'Failed to sign in.'));
  }
}

export async function signOutFromSupabase() {
  if (!supabase) {
    return;
  }
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(formatSupabaseError(error, 'Failed to sign out.'));
  }
}

export async function getSupabaseSession() {
  if (!supabase) {
    return null;
  }
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error(formatSupabaseError(error, 'Failed to load auth session.'));
  }
  return data.session;
}

export function onSupabaseAuthStateChange(callback: AuthStateCallback) {
  if (!supabase) {
    return () => {};
  }
  const { data } = supabase.auth.onAuthStateChange(callback);
  return () => data.subscription.unsubscribe();
}

export async function getUploadHistory(limit = 25): Promise<UploadHistoryItem[]> {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY).'
    );
  }

  const { data, error } = await supabase
    .from('uploads')
    .select('id, created_at, file_name, total_trips, gross_revenue, net_earnings, cancellation_rate')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(formatSupabaseError(error, 'Failed to load upload history.'));
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    createdAt: row.created_at as string,
    fileName: row.file_name as string,
    totalTrips: row.total_trips as number,
    grossRevenue: Number(row.gross_revenue),
    netEarnings: row.net_earnings === null ? null : Number(row.net_earnings),
    cancellationRate: Number(row.cancellation_rate),
  }));
}

export async function getHistoricalRevenueSeries(uploadId: string): Promise<Array<{ label: string; revenue: number }>> {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY).'
    );
  }

  const { data, error } = await supabase
    .from('trips')
    .select('upload_id, row_number, trip_end, gross_revenue, status')
    .eq('upload_id', uploadId)
    .order('row_number', { ascending: true })
    .returns<HistoricalTripRow[]>();

  if (error) {
    throw new Error(formatSupabaseError(error, 'Failed to load historical trip rows.'));
  }

  const revenueByDay = new Map<string, number>();
  for (const row of data ?? []) {
    if (!isCompletedStatus(row.status)) {
      continue;
    }
    const dayKey = row.trip_end.slice(0, 10);
    revenueByDay.set(dayKey, (revenueByDay.get(dayKey) ?? 0) + Number(row.gross_revenue));
  }

  return Array.from(revenueByDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, revenue]) => ({
      label: new Date(`${dayKey}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      revenue: Number(revenue.toFixed(2)),
    }));
}
