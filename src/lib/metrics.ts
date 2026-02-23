import type { DashboardData, TuroTripRecord } from './types';

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
  const grossRevenue = records.reduce((sum, row) => sum + row.grossRevenue, 0);
  const totalEarnings = records.reduce((sum, row) => sum + (row.netEarnings ?? row.grossRevenue), 0);

  const netRows = records.filter((row) => row.netEarnings !== null);
  const netEarnings = netRows.length > 0 ? netRows.reduce((sum, row) => sum + (row.netEarnings ?? 0), 0) : null;
  const lrShare = records.reduce((sum, row) => sum + row.lrShare, 0);
  const ownerShare = records.reduce((sum, row) => sum + row.ownerShare, 0);
  const averageTripValue = totalTrips > 0 ? grossRevenue / totalTrips : 0;

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
    .map(([key, revenue]) => ({ month: monthLabel(key), revenue: Number(revenue.toFixed(2)) }));

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
      lrShare: Number(value.lrShare.toFixed(2)),
      ownerShare: Number(value.ownerShare.toFixed(2)),
    }));

  const vehicleMap = new Map<string, { grossRevenue: number; tripCount: number }>();
  for (const row of records) {
    const current = vehicleMap.get(row.vehicleName) ?? { grossRevenue: 0, tripCount: 0 };
    current.grossRevenue += row.grossRevenue;
    current.tripCount += 1;
    vehicleMap.set(row.vehicleName, current);
  }

  const vehiclePerformance = Array.from(vehicleMap.entries())
    .map(([vehicle, values]) => ({
      vehicle,
      grossRevenue: Number(values.grossRevenue.toFixed(2)),
      tripCount: values.tripCount,
    }))
    .sort((a, b) => b.grossRevenue - a.grossRevenue)
    .slice(0, 8);

  const vehicleBreakdownMap = new Map<string, { trips: number; totalEarnings: number; lrShare: number; ownerShare: number }>();
  for (const row of records) {
    const current = vehicleBreakdownMap.get(row.vehicleName) ?? { trips: 0, totalEarnings: 0, lrShare: 0, ownerShare: 0 };
    current.trips += 1;
    current.totalEarnings += row.netEarnings ?? row.grossRevenue;
    current.lrShare += row.lrShare;
    current.ownerShare += row.ownerShare;
    vehicleBreakdownMap.set(row.vehicleName, current);
  }

  const vehicleBreakdown = Array.from(vehicleBreakdownMap.entries())
    .map(([vehicle, values]) => ({
      vehicle,
      trips: values.trips,
      totalEarnings: Number(values.totalEarnings.toFixed(2)),
      lrShare: Number(values.lrShare.toFixed(2)),
      ownerShare: Number(values.ownerShare.toFixed(2)),
    }))
    .sort((a, b) => b.totalEarnings - a.totalEarnings);

  return {
    metrics: {
      totalTrips,
      grossRevenue: Number(grossRevenue.toFixed(2)),
      totalEarnings: Number(totalEarnings.toFixed(2)),
      netEarnings: netEarnings === null ? null : Number(netEarnings.toFixed(2)),
      lrShare: Number(lrShare.toFixed(2)),
      ownerShare: Number(ownerShare.toFixed(2)),
      averageTripValue: Number(averageTripValue.toFixed(2)),
      cancellationRate: Number(cancellationRate.toFixed(1)),
    },
    monthlyRevenue,
    monthlyUtilization,
    monthlySplit,
    vehicleBreakdown,
    vehiclePerformance,
  };
}
