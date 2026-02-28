import type { CompanySettings, OwnerStatement } from '../lib/types';

function fmtCurrency(value: number): string {
  return value.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Show a deduction as a parenthetical negative: ($123.45) */
function fmtNeg(value: number): string {
  return `(${fmtCurrency(Math.abs(value))})`;
}

function fmtPct(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

function formatDate(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(`${value}T00:00:00`) : value;
  return d.toLocaleDateString(undefined, {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
  });
}

type OwnerStatementDocumentProps = {
  statement: OwnerStatement;
  company: CompanySettings;
};

export default function OwnerStatementDocument({ statement, company }: OwnerStatementDocumentProps) {
  // ── Derived KPIs ──────────────────────────────────────────────────────────
  const totalRentalDays = statement.trips.reduce((s, t) => s + t.days, 0);
  const totalMilesDriven = statement.totalMilesDriven;
  const [periodYear, periodMon] = statement.month.split('-').map(Number);
  const daysInPeriod = new Date(periodYear, periodMon, 0).getDate();
  const utilizationPct =
    daysInPeriod > 0 && totalRentalDays > 0 ? (totalRentalDays / daysInPeriod) * 100 : 0;
  const avgDailyRate = totalRentalDays > 0 ? statement.totalGrossRevenue / totalRentalDays : 0;
  const avgTripLength = statement.trips.length > 0 ? totalRentalDays / statement.trips.length : 0;

  // Per-mile metric (only meaningful when miles data exists)
  const netPerMile =
    totalMilesDriven > 0 ? statement.totalBalanceDueOwner / totalMilesDriven : null;

  // Net from trip activity before expenses (trip table tfoot)
  const netBeforeExpenses =
    statement.totalGrossRevenue - statement.totalManagementFees;

  // Trip table — show Channel col only if any trip has one
  const hasChannel = statement.trips.some((t) => t.channel !== null && t.channel !== '');

  return (
    <article className="statement-doc">

      {/* ── Letterhead ──────────────────────────────────────────────────── */}
      <header className="statement-letterhead">
        <div className="statement-logo-mark">
          <span className="statement-logo-initials">{company.logoText || 'LR'}</span>
        </div>
        <div className="statement-company-info">
          <h1 className="statement-company-name">{company.companyName}</h1>
          {company.street && <p>{company.street}</p>}
          {company.cityStateZip && <p>{company.cityStateZip}</p>}
          {company.phone && <p>{company.phone}</p>}
          {company.email && <p>{company.email}</p>}
        </div>
      </header>

      <div className="statement-divider" />

      {/* ── Header meta ─────────────────────────────────────────────────── */}
      <div className="statement-header-cols">
        <div className="statement-address-block">
          <p className="statement-block-label">Prepared For</p>
          <p className="statement-owner-name">{statement.ownerName}</p>
        </div>
        <div className="statement-meta-block">
          <div className="statement-meta-row">
            <span className="statement-meta-label">Statement Date</span>
            <span className="statement-meta-value">{formatDate(statement.statementDate)}</span>
          </div>
          <div className="statement-meta-row">
            <span className="statement-meta-label">Statement Period</span>
            <span className="statement-meta-value">{statement.monthLabel}</span>
          </div>
        </div>
      </div>

      {/* ── 1. Asset Performance Snapshot ───────────────────────────────── */}
      <section className="statement-section">
        <h2 className="statement-section-title">Asset Performance Snapshot</h2>

        {/* Row 1 — Revenue Efficiency */}
        <p className="kpi-row-label">Revenue Efficiency</p>
        <div className="kpi-snapshot-grid">
          <div className="kpi-snapshot-tile">
            <span className="kpi-snapshot-value">{fmtCurrency(statement.totalGrossRevenue)}</span>
            <span className="kpi-snapshot-label">Gross Revenue</span>
          </div>
          <div className="kpi-snapshot-tile">
            <span className="kpi-snapshot-value">
              {totalRentalDays > 0 ? fmtCurrency(avgDailyRate) : '—'}
            </span>
            <span className="kpi-snapshot-label">Avg Daily Rate</span>
          </div>
        </div>

        {/* Row 2 — Utilization & Wear */}
        <p className="kpi-row-label">Utilization</p>
        <div className="kpi-snapshot-grid">
          <div className="kpi-snapshot-tile">
            <span className="kpi-snapshot-value">
              {totalRentalDays > 0 ? String(totalRentalDays) : '0'}
            </span>
            <span className="kpi-snapshot-label">Total Rental Days</span>
          </div>
          <div className="kpi-snapshot-tile">
            <span className="kpi-snapshot-value">
              {totalRentalDays > 0 ? fmtPct(utilizationPct) : '—'}
            </span>
            <span className="kpi-snapshot-label">
              Utilization ({daysInPeriod}d period)
            </span>
          </div>
          <div className="kpi-snapshot-tile">
            <span className="kpi-snapshot-value">
              {statement.trips.length > 0 ? avgTripLength.toFixed(1) : '—'}
            </span>
            <span className="kpi-snapshot-label">Avg Trip Days</span>
          </div>
          <div className="kpi-snapshot-tile">
            <span className="kpi-snapshot-value">
              {totalMilesDriven > 0 ? totalMilesDriven.toLocaleString() : '—'}
            </span>
            <span className="kpi-snapshot-label">Total Miles Driven</span>
          </div>
        </div>

        {/* Optional Row — only rendered when per-mile data or expense ratio is available */}
        {netPerMile !== null && (
          <div className="kpi-snapshot-grid kpi-snapshot-grid-optional">
            <div className="kpi-snapshot-tile">
              <span className="kpi-snapshot-value">{fmtCurrency(netPerMile)}</span>
              <span className="kpi-snapshot-label">Net Revenue / Mile</span>
            </div>
          </div>
        )}
      </section>

      {/* ── 2. Trip Detail Table ────────────────────────────────────────── */}
      <section className="statement-section">
        <h2 className="statement-section-title">
          Trip Detail &nbsp;
          <span className="statement-section-period">{statement.monthLabel}</span>
        </h2>

        {statement.trips.length === 0 ? (
          <p className="statement-no-data">No rental activity for this period.</p>
        ) : (
          <div className="statement-table-scroll">
            <table className="statement-table">
              <thead>
                <tr>
                  <th>Trip Start</th>
                  <th>Trip End</th>
                  <th>Vehicle</th>
                  <th className="col-center">Days</th>
                  <th className="col-currency">Gross Revenue</th>
                  {hasChannel && <th>Channel</th>}
                  <th className="col-currency">Mgmt Fee</th>
                  <th className="col-currency">Net to Owner</th>
                </tr>
              </thead>
              <tbody>
                {statement.trips.map((trip, index) => (
                  <tr key={trip.tripId} className={index % 2 === 0 ? 'row-even' : 'row-odd'}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(trip.tripStart)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(trip.tripEnd)}</td>
                    <td>{trip.vehicle}</td>
                    <td className="col-center">{trip.days}</td>
                    <td className="col-currency">{fmtCurrency(trip.grossRevenue)}</td>
                    {hasChannel && (
                      <td>{trip.channel ?? '—'}</td>
                    )}
                    <td className="col-currency col-deduction">
                      {trip.managementFees > 0 ? fmtNeg(trip.managementFees) : '—'}
                    </td>
                    <td className="col-currency col-net">{fmtCurrency(trip.netToOwner)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="statement-totals-row">
                  <td colSpan={hasChannel ? 5 : 4} className="totals-label">Totals</td>
                  <td className="col-currency">{fmtCurrency(statement.totalGrossRevenue)}</td>
                  <td className="col-currency col-deduction">
                    {statement.totalManagementFees > 0 ? fmtNeg(statement.totalManagementFees) : '—'}
                  </td>
                  <td className="col-currency col-net">{fmtCurrency(netBeforeExpenses)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* ── 4. Vehicle Expenses ─────────────────────────────────────────── */}
      <section className="statement-section">
        <h2 className="statement-section-title">
          Vehicle Expenses &nbsp;
          <span className="statement-section-period">{statement.monthLabel}</span>
        </h2>

        {statement.expenses.length === 0 ? (
          <p className="statement-no-data">No expenses recorded for this period.</p>
        ) : (
          <div className="statement-table-scroll">
            <table className="statement-table statement-table-expenses">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Vehicle</th>
                  <th>Description</th>
                  <th className="col-currency">Amount</th>
                </tr>
              </thead>
              <tbody>
                {statement.expenses.map((exp, index) => (
                  <tr key={exp.id} className={index % 2 === 0 ? 'row-even' : 'row-odd'}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(exp.date)}</td>
                    <td>{exp.vehicle ?? '—'}</td>
                    <td>{exp.description}</td>
                    <td className="col-currency col-deduction">
                      {exp.amount > 0 ? fmtNeg(exp.amount) : fmtCurrency(exp.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="statement-totals-row">
                  <td colSpan={3} className="totals-label">Total Vehicle Expenses</td>
                  <td className="col-currency col-deduction">
                    {statement.totalExpenses > 0 ? fmtNeg(statement.totalExpenses) : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* ── 5. Earnings & Distribution ──────────────────────────────────── */}
      <section className="statement-summary-section">
        <h2 className="statement-section-title">Earnings &amp; Distribution</h2>
        <div className="statement-summary-wrap">
          <div className="earnings-summary-box">
            <div className="earnings-line">
              <span>Gross Revenue</span>
              <span className="earnings-amount">{fmtCurrency(statement.totalGrossRevenue)}</span>
            </div>
            <div className="earnings-line earnings-deduction">
              <span>Less Fleet Management Fee</span>
              <span className="earnings-amount">
                {statement.totalManagementFees > 0 ? fmtNeg(statement.totalManagementFees) : '—'}
              </span>
            </div>
            <div className="earnings-line earnings-deduction">
              <span>Less Vehicle Expenses</span>
              <span className="earnings-amount">
                {statement.totalExpenses > 0 ? fmtNeg(statement.totalExpenses) : '—'}
              </span>
            </div>
            <div className="earnings-separator" />
            <div className="earnings-line earnings-net-line">
              <span>Net Earnings</span>
              <span className="earnings-amount earnings-net-amount">
                {fmtCurrency(statement.totalBalanceDueOwner)}
              </span>
            </div>
          </div>

          <div className="balance-callout">
            <span className="balance-label">Owner Distribution</span>
            <span className="balance-amount">{fmtCurrency(statement.totalBalanceDueOwner)}</span>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="statement-doc-footer">
        <p>Generated by {company.companyName} on {formatDate(statement.statementDate)}.</p>
        {company.email && <p>Questions? Contact {company.email}.</p>}
      </footer>

    </article>
  );
}
