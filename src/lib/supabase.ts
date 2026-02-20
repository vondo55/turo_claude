import { createClient } from '@supabase/supabase-js';
import type { DashboardData, TuroTripRecord } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const supabaseClientKey = supabasePublishableKey ?? supabaseAnonKey;

export const supabase =
  supabaseUrl && supabaseClientKey ? createClient(supabaseUrl, supabaseClientKey) : null;

export async function saveUploadToSupabase(fileName: string, records: TuroTripRecord[], dashboard: DashboardData) {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY).'
    );
  }

  const { data: uploadRow, error: uploadError } = await supabase
    .from('uploads')
    .insert({
      file_name: fileName,
      total_trips: dashboard.metrics.totalTrips,
      gross_revenue: dashboard.metrics.grossRevenue,
      net_earnings: dashboard.metrics.netEarnings,
      cancellation_rate: dashboard.metrics.cancellationRate,
    })
    .select('id')
    .single();

  if (uploadError) {
    throw uploadError;
  }

  const payload = records.map((row) => ({
    upload_id: uploadRow.id,
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
    throw tripsError;
  }
}
