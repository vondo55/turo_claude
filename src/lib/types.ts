export type TuroTripRecord = {
  rowNumber: number;
  tripStart: Date;
  tripEnd: Date;
  vehicleName: string;
  ownerName: string;
  guestName: string;
  grossRevenue: number;
  netEarnings: number | null;
  addonsRevenue: number | null;
  lrShare: number;
  ownerShare: number;
  legacyLrShare: number;
  legacyOwnerShare: number;
  isCancelled: boolean;
  status: string | null;
};

export type ParseResult = {
  records: TuroTripRecord[];
  warnings: string[];
};

export type DashboardMetrics = {
  totalTrips: number;
  totalBookings: number;
  activeMonths: number;
  grossRevenue: number;
  totalEarnings: number;
  netEarnings: number | null;
  lrShare: number;
  ownerShare: number;
  averageTripValue: number;
  totalLaborHours: number;
  laborCost: number;
  lrSharePerLaborHour: number;
  laborToLrSharePct: number;
  averageMonthlyLrShare: number;
  lrSharePerBooking: number;
  cancellationRate: number;
};

export type VehicleBreakdown = {
  vehicle: string;
  ownerName: string;
  trips: number;
  totalBookings: number;
  totalEarnings: number;
  lrShare: number;
  ownerShare: number;
  totalLaborHours: number;
  laborCost: number;
  lrSharePerLaborHour: number;
  laborToLrSharePct: number;
  averageMonthlyLrShare: number;
  lrSharePerBooking: number;
};

export type DashboardData = {
  metrics: DashboardMetrics;
  monthlyRevenue: Array<{ month: string; revenue: number }>;
  monthlyUtilization: Array<{ month: string; utilizationPct: number }>;
  monthlySplit: Array<{ month: string; lrShare: number; ownerShare: number }>;
  vehicleBreakdown: VehicleBreakdown[];
  vehiclePerformance: Array<{
    vehicle: string;
    ownerName: string;
    grossRevenue: number;
    tripCount: number;
    utilizationPct: number;
  }>;
};

export type OwnerStatementTrip = {
  tripId: string;
  vehicle: string;
  renter: string;
  tripStart: Date;
  tripEnd: Date;
  days: number;
  grossRevenue: number;
  turoFees: number;
  managementFees: number;
  netToOwner: number;
};

export type OwnerStatementExpense = {
  id: string;
  description: string;
  date: string;
  amount: number;
};

export type OwnerStatement = {
  ownerName: string;
  month: string;
  monthLabel: string;
  statementDate: string;
  trips: OwnerStatementTrip[];
  expenses: OwnerStatementExpense[];
  totalGrossRevenue: number;
  totalTuroFees: number;
  totalManagementFees: number;
  totalExpenses: number;
  totalBalanceDueOwner: number;
};

export type CompanySettings = {
  companyName: string;
  street: string;
  cityStateZip: string;
  phone?: string;
  email?: string;
  logoText?: string;
};
