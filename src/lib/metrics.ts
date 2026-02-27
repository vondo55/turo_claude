import type { DashboardData, OwnerStatement, OwnerStatementExpense, OwnerStatementTrip, TuroTripRecord } from './types';

const LABOR_HOURS_PER_BOOKING = 2;
const LABOR_RATE_PER_HOUR = 15;

function roundCurrency(value: number): number {
  return Number(value.toFixed(2));
}

function roundPct(value: number): number {
  return Number(value.toFixed(2));
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  });
}

function dayDiff(start: Date, end: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = Math.ceil((end.getTime() - start.getTime()) / msPerDay);
  return Math.max(1, diff);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function buildDashboardData(records: TuroTripRecord[]): DashboardData {
  const totalTrips = records.length;
  const totalBookings = totalTrips;
  const activeMonths = Math.max(1, new Set(records.map((row) => monthKey(row.tripEnd))).size);
  const grossRevenue = records.reduce((sum, row) => sum + row.grossRevenue, 0);
  const totalEarnings = records.reduce((sum, row) => sum + (row.netEarnings ?? row.grossRevenue), 0);

  const netRows = records.filter((row) => row.netEarnings !== null && row.netEarnings !== undefined);
  const netEarnings = netRows.length > 0 ? netRows.reduce((sum, row) => sum + (row.netEarnings ?? 0), 0) : null;
  const lrShare = records.reduce((sum, row) => sum + row.lrShare, 0);
  const ownerShare = records.reduce((sum, row) => sum + row.ownerShare, 0);
  const averageTripValue = totalTrips > 0 ? grossRevenue / totalTrips : 0;
  const totalLaborHours = totalBookings * LABOR_HOURS_PER_BOOKING;
  const laborCost = totalLaborHours * LABOR_RATE_PER_HOUR;
  const lrSharePerLaborHour = totalLaborHours > 0 ? lrShare / totalLaborHours : 0;
  const laborToLrSharePct = lrShare > 0 ? (laborCost / lrShare) * 100 : 0;
  const averageMonthlyLrShare = activeMonths > 0 ? lrShare / activeMonths : 0;
  const lrSharePerBooking = totalBookings > 0 ? lrShare / totalBookings : 0;

  const cancelledCount = records.filter((row) => row.isCancelled).length;
  const cancellationRate = totalTrips > 0 ? (cancelledCount / totalTrips) * 100 : 0;

  const revenueByMonth = new Map<string, number>();
  const bookedDaysByMonth = new Map<string, number>();
  const activeVehiclesByMonth = new Map<string, Set<string>>();
  const splitByMonth = new Map<string, { lrShare: number; ownerShare: number }>();

  for (const row of records) {
    const key = monthKey(row.tripEnd);
    revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + row.grossRevenue);
    bookedDaysByMonth.set(key, (bookedDaysByMonth.get(key) ?? 0) + dayDiff(row.tripStart, row.tripEnd));
    const vehicles = activeVehiclesByMonth.get(key) ?? new Set<string>();
    vehicles.add(row.vehicleName);
    activeVehiclesByMonth.set(key, vehicles);
    const splitCurrent = splitByMonth.get(key) ?? { lrShare: 0, ownerShare: 0 };
    splitCurrent.lrShare += row.lrShare;
    splitCurrent.ownerShare += row.ownerShare;
    splitByMonth.set(key, splitCurrent);
  }

  const monthlyRevenue = Array.from(revenueByMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, revenue]) => ({ month: monthLabel(key), revenue: roundCurrency(revenue) }));

  const monthlyUtilization = Array.from(bookedDaysByMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, bookedDays]) => {
      const [year, month] = key.split('-').map(Number);
      const activeVehicles = Math.max(1, activeVehiclesByMonth.get(key)?.size ?? 1);
      const monthCapacityDays = daysInMonth(year, month - 1) * activeVehicles;
      const pct = (bookedDays / monthCapacityDays) * 100;
      return { month: monthLabel(key), utilizationPct: Number(Math.min(pct, 100).toFixed(1)) };
    });

  const monthlySplit = Array.from(splitByMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({
      month: monthLabel(key),
      lrShare: roundCurrency(value.lrShare),
      ownerShare: roundCurrency(value.ownerShare),
    }));

  const vehicleMap = new Map<string, { ownerName: string; grossRevenue: number; tripCount: number }>();
  const vehicleMonthTripCounts = new Map<string, Map<string, number>>();
  for (const row of records) {
    const current = vehicleMap.get(row.vehicleName) ?? { ownerName: row.ownerName, grossRevenue: 0, tripCount: 0 };
    current.grossRevenue += row.grossRevenue;
    current.tripCount += 1;
    current.ownerName = row.ownerName;
    vehicleMap.set(row.vehicleName, current);

    const monthCounts = vehicleMonthTripCounts.get(row.vehicleName) ?? new Map<string, number>();
    const key = monthKey(row.tripEnd);
    monthCounts.set(key, (monthCounts.get(key) ?? 0) + 1);
    vehicleMonthTripCounts.set(row.vehicleName, monthCounts);
  }

  const vehiclePerformance = Array.from(vehicleMap.entries())
    .map(([vehicle, values]) => {
      const monthCounts = vehicleMonthTripCounts.get(vehicle) ?? new Map<string, number>();
      const monthlyUtilization = Array.from(monthCounts.entries()).map(([key, tripCount]) => {
        const [year, month] = key.split('-').map(Number);
        const capacityDays = daysInMonth(year, month - 1);
        const bookedDays = tripCount * LABOR_HOURS_PER_BOOKING;
        return Math.min((bookedDays / capacityDays) * 100, 100);
      });
      const utilizationPct =
        monthlyUtilization.length > 0
          ? Number((monthlyUtilization.reduce((sum, value) => sum + value, 0) / monthlyUtilization.length).toFixed(1))
          : 0;

      return {
        vehicle,
        ownerName: values.ownerName,
        grossRevenue: roundCurrency(values.grossRevenue),
        tripCount: values.tripCount,
        utilizationPct,
      };
    })
    .sort((a, b) => b.grossRevenue - a.grossRevenue);

  const vehicleBreakdownMap = new Map<
    string,
    { ownerName: string; trips: number; totalEarnings: number; lrShare: number; ownerShare: number }
  >();
  for (const row of records) {
    const current = vehicleBreakdownMap.get(row.vehicleName) ?? {
      ownerName: row.ownerName,
      trips: 0,
      totalEarnings: 0,
      lrShare: 0,
      ownerShare: 0,
    };
    current.trips += 1;
    current.totalEarnings += row.netEarnings ?? row.grossRevenue;
    current.lrShare += row.lrShare;
    current.ownerShare += row.ownerShare;
    current.ownerName = row.ownerName;
    vehicleBreakdownMap.set(row.vehicleName, current);
  }

  const vehicleBreakdown = Array.from(vehicleBreakdownMap.entries())
    .map(([vehicle, values]) => ({
      vehicle,
      ownerName: values.ownerName,
      trips: values.trips,
      totalBookings: values.trips,
      totalEarnings: roundCurrency(values.totalEarnings),
      lrShare: roundCurrency(values.lrShare),
      ownerShare: roundCurrency(values.ownerShare),
      totalLaborHours: values.trips * LABOR_HOURS_PER_BOOKING,
      laborCost: roundCurrency(values.trips * LABOR_HOURS_PER_BOOKING * LABOR_RATE_PER_HOUR),
      lrSharePerLaborHour: values.trips > 0 ? roundCurrency(values.lrShare / (values.trips * LABOR_HOURS_PER_BOOKING)) : 0,
      laborToLrSharePct: values.lrShare > 0 ? roundPct(((values.trips * LABOR_HOURS_PER_BOOKING * LABOR_RATE_PER_HOUR) / values.lrShare) * 100) : 0,
      averageMonthlyLrShare: roundCurrency(values.lrShare / activeMonths),
      lrSharePerBooking: values.trips > 0 ? roundCurrency(values.lrShare / values.trips) : 0,
    }))
    .sort((a, b) => b.totalEarnings - a.totalEarnings);

  return {
    metrics: {
      totalTrips,
      totalBookings,
      activeMonths,
      grossRevenue: roundCurrency(grossRevenue),
      totalEarnings: roundCurrency(totalEarnings),
      netEarnings: netEarnings === null ? null : roundCurrency(netEarnings),
      lrShare: roundCurrency(lrShare),
      ownerShare: roundCurrency(ownerShare),
      averageTripValue: roundCurrency(averageTripValue),
      totalLaborHours,
      laborCost: roundCurrency(laborCost),
      lrSharePerLaborHour: roundCurrency(lrSharePerLaborHour),
      laborToLrSharePct: roundPct(laborToLrSharePct),
      averageMonthlyLrShare: roundCurrency(averageMonthlyLrShare),
      lrSharePerBooking: roundCurrency(lrSharePerBooking),
      cancellationRate: Number(cancellationRate.toFixed(1)),
    },
    monthlyRevenue,
    monthlyUtilization,
    monthlySplit,
    vehicleBreakdown,
    vehiclePerformance,
  };
}

export function buildOwnerStatements(
  records: TuroTripRecord[],
  displayMonthLabel: string,
  month: string,
  expenses: OwnerStatementExpense[]
): OwnerStatement {
  const trips: OwnerStatementTrip[] = records
    .map((r) => {
      const grossRevenue = roundCurrency(r.grossRevenue);
      const turoFees = roundCurrency(r.netEarnings !== null ? r.grossRevenue - r.netEarnings : 0);
      const managementFees = roundCurrency(r.grossRevenue * 0.30);
      const netToOwner = roundCurrency(grossRevenue - turoFees - managementFees);
      return {
        tripId: String(r.rowNumber),
        vehicle: r.vehicleName,
        renter: r.guestName,
        tripStart: r.tripStart,
        tripEnd: r.tripEnd,
        days: dayDiff(r.tripStart, r.tripEnd),
        grossRevenue,
        turoFees,
        managementFees,
        netToOwner,
      };
    })
    .sort((a, b) => a.tripStart.getTime() - b.tripStart.getTime());

  const totalGrossRevenue = roundCurrency(trips.reduce((s, t) => s + t.grossRevenue, 0));
  const totalTuroFees = roundCurrency(trips.reduce((s, t) => s + t.turoFees, 0));
  const totalManagementFees = roundCurrency(trips.reduce((s, t) => s + t.managementFees, 0));
  const totalExpenses = roundCurrency(expenses.reduce((s, e) => s + e.amount, 0));

  return {
    ownerName: records[0]?.ownerName ?? '',
    month,
    monthLabel: displayMonthLabel,
    statementDate: new Date().toISOString().slice(0, 10),
    trips,
    expenses,
    totalGrossRevenue,
    totalTuroFees,
    totalManagementFees,
    totalExpenses,
    totalBalanceDueOwner: roundCurrency(totalGrossRevenue - totalTuroFees - totalManagementFees - totalExpenses),
  };
}
