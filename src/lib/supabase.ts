import { createClient } from '@supabase/supabase-js';
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
  tripsRecovered: boolean;
};

function formatSupabaseError(error: SupabaseErrorLike, fallback: string) {
  const parts = [error.message, error.details, error.hint].filter(Boolean);
  const base = parts.length > 0 ? parts.join(' | ') : fallback;
  return error.code ? `${base} (code: ${error.code})` : base;
}

function formatUuidFromBytes(bytes: Uint8Array) {
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function buildDeterministicUploadId(records: TuroTripRecord[]) {
  const canonical = records
    .map((row) =>
      [
        row.rowNumber,
        row.tripStart.toISOString(),
        row.tripEnd.toISOString(),
        row.vehicleName,
        row.ownerName,
        row.grossRevenue,
        row.netEarnings ?? '',
        row.addonsRevenue ?? '',
        row.isCancelled ? 1 : 0,
        row.status ?? '',
      ].join('|')
    )
    .join('\n');

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return formatUuidFromBytes(bytes);
}

export async function saveUploadToSupabase(
  fileName: string,
  records: TuroTripRecord[],
  dashboard: DashboardData
): Promise<SaveUploadResult> {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY).'
    );
  }

  const uploadId = await buildDeterministicUploadId(records);

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

  const payload = records.map((row) => ({
    upload_id: uploadId,
    row_number: row.rowNumber,
    trip_start: row.tripStart.toISOString(),
    trip_end: row.tripEnd.toISOString(),
    vehicle_name: row.vehicleName,
    gross_revenue: row.grossRevenue,
    net_earnings: row.netEarnings,
    addons_revenue: row.addonsRevenue,
    is_cancelled: row.isCancelled,
    status: row.status,
  }));

  if (duplicateUpload) {
    const { error: recoveryError } = await supabase.from('trips').upsert(payload, {
      onConflict: 'upload_id,row_number',
      ignoreDuplicates: true,
    });

    if (recoveryError) {
      if (recoveryError.code === '42P10') {
        return { duplicateUpload: true, tripsRecovered: false };
      }
      throw new Error(formatSupabaseError(recoveryError, 'Failed to backfill trip rows.'));
    }

    return { duplicateUpload: true, tripsRecovered: true };
  }

  const { error: tripsError } = await supabase.from('trips').insert(payload);

  if (tripsError) {
    throw new Error(formatSupabaseError(tripsError, 'Failed to insert trip rows.'));
  }

  return { duplicateUpload: false, tripsRecovered: false };
}
