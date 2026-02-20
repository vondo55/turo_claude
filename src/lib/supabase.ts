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

function formatSupabaseError(error: SupabaseErrorLike, fallback: string) {
  const parts = [error.message, error.details, error.hint].filter(Boolean);
  const base = parts.length > 0 ? parts.join(' | ') : fallback;
  return error.code ? `${base} (code: ${error.code})` : base;
}

export async function saveUploadToSupabase(fileName: string, records: TuroTripRecord[], dashboard: DashboardData) {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY).'
    );
  }

  const uploadId = crypto.randomUUID();

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

  if (uploadError) {
    throw new Error(formatSupabaseError(uploadError, 'Failed to insert upload row.'));
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

  const { error: tripsError } = await supabase.from('trips').insert(payload);
  if (tripsError) {
    throw new Error(formatSupabaseError(tripsError, 'Failed to insert trip rows.'));
  }
}
