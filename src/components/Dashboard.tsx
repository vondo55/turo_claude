import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useMemo, useState } from 'react';
import type { DashboardData } from '../lib/types';

type DashboardProps = {
  data: DashboardData;
  revenueSeries: Array<{ label: string; revenue: number }>;
  revenueTitle: string;
  sharePolicyLabel: string;
};

type DashboardTab = 'overview' | 'ownerEconomics' | 'fleetOperations';

function currency(value: number | null): string {
  if (value === null) return 'N/A';
  return value.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function percent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export default function Dashboard({ data, revenueSeries, revenueTitle, sharePolicyLabel }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');

  const averageUtilization = useMemo(() => {
    if (data.monthlyUtilization.length === 0) return 0;
    const total = data.monthlyUtilization.reduce((sum, row) => sum + row.utilizationPct, 0);
    return total / data.monthlyUtilization.length;
  }, [data.monthlyUtilization]);

  const averageDowntime = Math.max(0, 100 - averageUtilization);
  const activeVehicles = data.vehicleBreakdown.length;
  const tripsPerVehicle = activeVehicles > 0 ? data.metrics.totalTrips / activeVehicles : 0;
  const fleetBookingsHistogram = useMemo(() => {
    const bins = [
      { label: '1-2', min: 1, max: 2, count: 0 },
      { label: '3-5', min: 3, max: 5, count: 0 },
      { label: '6-10', min: 6, max: 10, count: 0 },
      { label: '11-15', min: 11, max: 15, count: 0 },
      { label: '16+', min: 16, max: Number.POSITIVE_INFINITY, count: 0 },
    ];

    for (const vehicle of data.vehiclePerformance) {
      const matchingBin = bins.find((bin) => vehicle.tripCount >= bin.min && vehicle.tripCount <= bin.max);
      if (matchingBin) {
        matchingBin.count += 1;
      }
    }

    return bins.map((bin) => ({
      range: bin.label,
      vehicleCount: bin.count,
    }));
  }, [data.vehiclePerformance]);
  const lrSharePct = data.metrics.totalEarnings > 0 ? (data.metrics.lrShare / data.metrics.totalEarnings) * 100 : 0;
  const ownerSharePct = data.metrics.totalEarnings > 0 ? (data.metrics.ownerShare / data.metrics.totalEarnings) * 100 : 0;
  const reconciliationGap = data.metrics.totalEarnings - (data.metrics.lrShare + data.metrics.ownerShare);
  const hasReconciliationGap = Math.abs(reconciliationGap) > 0.01;

  return (
    <section className="dashboard">
      <div className="dashboard-tabs" role="tablist" aria-label="Dashboard Views">
        <button
          type="button"
          role="tab"
          className={activeTab === 'overview' ? 'tab-button active' : 'tab-button'}
          aria-selected={activeTab === 'overview'}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          type="button"
          role="tab"
          className={activeTab === 'ownerEconomics' ? 'tab-button active' : 'tab-button'}
          aria-selected={activeTab === 'ownerEconomics'}
          onClick={() => setActiveTab('ownerEconomics')}
        >
          Owner Economics
        </button>
        <button
          type="button"
          role="tab"
          className={activeTab === 'fleetOperations' ? 'tab-button active' : 'tab-button'}
          aria-selected={activeTab === 'fleetOperations'}
          onClick={() => setActiveTab('fleetOperations')}
        >
          Fleet Operations
        </button>
      </div>

      {activeTab === 'overview' ? (
        <>
          <div className="kpis">
            <article className="kpi-card">
              <h3>Total Trips</h3>
              <p>{data.metrics.totalTrips.toLocaleString()}</p>
            </article>
            <article className="kpi-card">
              <h3>Gross Revenue</h3>
              <p>{currency(data.metrics.grossRevenue)}</p>
            </article>
            <article className="kpi-card">
              <h3>Total Earnings</h3>
              <p>{currency(data.metrics.totalEarnings)}</p>
            </article>
            <article className="kpi-card">
              <h3>Net Earnings</h3>
              <p>{currency(data.metrics.netEarnings)}</p>
            </article>
            <article className="kpi-card">
              <h3>Avg Trip Value</h3>
              <p>{currency(data.metrics.averageTripValue)}</p>
            </article>
            <article className="kpi-card">
              <h3>Cancellation Rate</h3>
              <p>{percent(data.metrics.cancellationRate)}</p>
            </article>
          </div>

          <div className="charts-grid">
            <article className="chart-card">
              <h3>{revenueTitle}</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={revenueSeries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="revenue" stroke="#0b6e4f" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </article>

            <article className="chart-card">
              <h3>Monthly Utilization Trend</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={data.monthlyUtilization}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="utilizationPct" stroke="#1f8a70" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </article>
          </div>
        </>
      ) : null}

      {activeTab === 'ownerEconomics' ? (
        <>
          <div className="kpis">
            <article className="kpi-card">
              <h3>Total Earnings</h3>
              <p>{currency(data.metrics.totalEarnings)}</p>
            </article>
            <article className="kpi-card">
              <h3>Total Bookings</h3>
              <p>{data.metrics.totalBookings.toLocaleString()}</p>
            </article>
            <article className="kpi-card">
              <h3>LR Share</h3>
              <p>{currency(data.metrics.lrShare)}</p>
            </article>
            <article className="kpi-card">
              <h3>Owner Share</h3>
              <p>{currency(data.metrics.ownerShare)}</p>
            </article>
            <article className="kpi-card">
              <h3>LR Split</h3>
              <p>{percent(lrSharePct)}</p>
            </article>
            <article className="kpi-card">
              <h3>Owner Split</h3>
              <p>{percent(ownerSharePct)}</p>
            </article>
            <article className={`kpi-card ${hasReconciliationGap ? 'alert' : 'subtle'}`}>
              <h3>Reconciliation Gap</h3>
              <p>{currency(reconciliationGap)}</p>
            </article>
          </div>
          <p className="metric-note">
            LR/Owner shares use {sharePolicyLabel}, not gross revenue only.
          </p>

          <article className="table-card">
            <h3>Owner Economics by Vehicle</h3>
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
                {data.vehicleBreakdown.map((vehicle) => (
                  <tr key={vehicle.vehicle}>
                    <td>{vehicle.ownerName}</td>
                    <td>{vehicle.vehicle}</td>
                    <td>{vehicle.totalBookings}</td>
                    <td>{currency(vehicle.totalEarnings)}</td>
                    <td>{currency(vehicle.lrShare)}</td>
                    <td>{currency(vehicle.ownerShare)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>All Owners</th>
                  <th>Totals</th>
                  <th>{data.metrics.totalBookings.toLocaleString()}</th>
                  <th>{currency(data.metrics.totalEarnings)}</th>
                  <th>{currency(data.metrics.lrShare)}</th>
                  <th>{currency(data.metrics.ownerShare)}</th>
                </tr>
              </tfoot>
            </table>
          </article>
        </>
      ) : null}

      {activeTab === 'fleetOperations' ? (
        <>
          <div className="kpis">
            <article className="kpi-card">
              <h3>Avg Utilization</h3>
              <p>{percent(averageUtilization)}</p>
            </article>
            <article className="kpi-card">
              <h3>Avg Downtime</h3>
              <p>{percent(averageDowntime)}</p>
            </article>
            <article className="kpi-card">
              <h3>Bookings per Vehicle</h3>
              <p>{tripsPerVehicle.toFixed(1)}</p>
            </article>
            <article className="kpi-card">
              <h3>Active Vehicles</h3>
              <p>{activeVehicles.toLocaleString()}</p>
            </article>
            <article className="kpi-card">
              <h3>Total Bookings</h3>
              <p>{data.metrics.totalBookings.toLocaleString()}</p>
            </article>
          </div>

          <div className="charts-grid">
            <article className="chart-card">
              <h3>Monthly Utilization (%)</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.monthlyUtilization}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Bar dataKey="utilizationPct" fill="#1f8a70" />
                </BarChart>
              </ResponsiveContainer>
            </article>

            <article className="chart-card">
              <h3>Bookings Distribution Across Vehicles</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={fleetBookingsHistogram}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="range" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="vehicleCount" fill="#457b9d" name="Vehicles" />
                </BarChart>
              </ResponsiveContainer>
            </article>
          </div>

          <article className="table-card">
            <h3>Fleet Operations by Vehicle</h3>
            <table>
              <thead>
                <tr>
                  <th>Owner</th>
                  <th>Vehicle</th>
                  <th>Bookings</th>
                  <th>Labor Hours</th>
                  <th>Gross Revenue</th>
                  <th>Revenue per Trip</th>
                </tr>
              </thead>
              <tbody>
                {data.vehiclePerformance.map((vehicle) => (
                  <tr key={vehicle.vehicle}>
                    <td>{vehicle.ownerName}</td>
                    <td>{vehicle.vehicle}</td>
                    <td>{vehicle.tripCount}</td>
                    <td>{vehicle.tripCount * 2}</td>
                    <td>{currency(vehicle.grossRevenue)}</td>
                    <td>{currency(vehicle.tripCount > 0 ? vehicle.grossRevenue / vehicle.tripCount : 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        </>
      ) : null}
    </section>
  );
}
