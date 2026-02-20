export type TuroTripRecord = {
  rowNumber: number;
  tripStart: Date;
  tripEnd: Date;
  vehicleName: string;
  grossRevenue: number;
  netEarnings: number | null;
  addonsRevenue: number | null;
  isCancelled: boolean;
  status: string | null;
};

export type ParseResult = {
  records: TuroTripRecord[];
  warnings: string[];
};

export type DashboardMetrics = {
  totalTrips: number;
  grossRevenue: number;
  netEarnings: number | null;
  averageTripValue: number;
  cancellationRate: number;
};

export type DashboardData = {
  metrics: DashboardMetrics;
  monthlyRevenue: Array<{ month: string; revenue: number }>;
  monthlyUtilization: Array<{ month: string; utilizationPct: number }>;
  vehiclePerformance: Array<{ vehicle: string; grossRevenue: number; tripCount: number }>;
  cancellationBreakdown: Array<{ name: string; value: number }>;
};
