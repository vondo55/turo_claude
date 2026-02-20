import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DashboardData } from '../lib/types';

type DashboardProps = {
  data: DashboardData;
};

function currency(value: number | null): string {
  if (value === null) return 'N/A';
  return value.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

export default function Dashboard({ data }: DashboardProps) {
  return (
    <section className="dashboard">
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
          <h3>Net Earnings</h3>
          <p>{currency(data.metrics.netEarnings)}</p>
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
          <h3>Avg Trip Value</h3>
          <p>{currency(data.metrics.averageTripValue)}</p>
        </article>
        <article className="kpi-card">
          <h3>Cancellation Rate</h3>
          <p>{data.metrics.cancellationRate}%</p>
        </article>
      </div>

      <div className="charts-grid">
        <article className="chart-card">
          <h3>Revenue Trend</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.monthlyRevenue}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="revenue" stroke="#0b6e4f" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </article>

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
          <h3>Cancellation Breakdown</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={data.cancellationBreakdown} dataKey="value" nameKey="name" outerRadius={90}>
                {data.cancellationBreakdown.map((slice) => (
                  <Cell key={slice.name} fill={slice.name === 'Cancelled' ? '#e63946' : '#457b9d'} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </article>
      </div>

      <article className="table-card">
        <h3>Top Vehicles by Revenue</h3>
        <table>
          <thead>
            <tr>
              <th>Vehicle</th>
              <th>Gross Revenue</th>
              <th>Trips</th>
            </tr>
          </thead>
          <tbody>
            {data.vehiclePerformance.map((vehicle) => (
              <tr key={vehicle.vehicle}>
                <td>{vehicle.vehicle}</td>
                <td>{currency(vehicle.grossRevenue)}</td>
                <td>{vehicle.tripCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </section>
  );
}
