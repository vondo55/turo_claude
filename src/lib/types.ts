export type TuroTripRecord = {
  rowNumber: number;
  tripStart: Date;
  tripEnd: Date;
  vehicleName: string;
  grossRevenue: number;
  netEarnings: number | null;
  addonsRevenue: number | null;
  lrShare: number;
  ownerShare: number;
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
  totalEarnings: number;
  netEarnings: number | null;
  lrShare: number;
  ownerShare: number;
  averageTripValue: number;
  cancellationRate: number;
};

export type VehicleBreakdown = {
  vehicle: string;
  trips: number;
  totalEarnings: number;
  lrShare: number;
  ownerShare: number;
};

export type DashboardData = {
  metrics: DashboardMetrics;
  monthlyRevenue: Array<{ month: string; revenue: number }>;
  monthlyUtilization: Array<{ month: string; utilizationPct: number }>;
  monthlySplit: Array<{ month: string; lrShare: number; ownerShare: number }>;
  vehicleBreakdown: VehicleBreakdown[];
  vehiclePerformance: Array<{ vehicle: string; grossRevenue: number; tripCount: number }>;
};
