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
  const [periodYear, periodMon] = statement.month.split('-').map(Number);
  const daysInPeriod = new Date(periodYear, periodMon, 0).getDate();
  const utilizationPct = daysInPeriod > 0 && totalRentalDays > 0 ? (totalRentalDays / daysInPeriod) * 100 : 0;
  const avgDailyRate = totalRentalDays > 0 ? statement.totalGrossRevenue / totalRentalDays : 0;
  const netPerRentalDay = totalRentalDays > 0 ? statement.totalBalanceDueOwner / totalRentalDays : 0;
  const avgTripLength = statement.trips.length > 0 ? totalRentalDays / statement.trips.length : 0;

  // Net from trip activity before expenses (shown in trip table tfoot)
  const netBeforeExpenses =
    statement.totalGrossRevenue - statement.totalTuroFees - statement.totalManagementFees;

  const kpiTiles = [
    {
      label: 'Gross Revenue',
      value: fmtCurrency(statement.totalGrossRevenue),
      accent: false,
    },
    {
      label: 'Net to Owner',
      value: fmtCurrency(statement.totalBalanceDueOwner),
      accent: true,
    },
    {
      label: 'Total Rental Days',
      value: totalRentalDays > 0 ? String(totalRentalDays) : '—',
      accent: false,
    },
    {
      label: `Utilization (of ${daysInPeriod} period days)`,
      value: totalRentalDays > 0 ? fmtPct(utilizationPct) : '—',
      accent: false,
    },
    {
      label: 'Avg Daily Rate',
      value: totalRentalDays > 0 ? fmtCurrency(avgDailyRate) : '—',
      accent: false,
    },
    {
      label: 'Net per Rental Day',
      value: totalRentalDays > 0 ? fmtCurrency(netPerRentalDay) : '—',
      accent: false,
    },
  ] as const;

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
          <div className="statement-meta-row">
            <span className="statement-meta-label">Trip Count</span>
            <span className="statement-meta-value">{statement.trips.length}</span>
          </div>
        </div>
      </div>

      {/* ── 1. Performance Snapshot ─────────────────────────────────────── */}
      <section className="statement-section">
        <h2 className="statement-section-title">Performance Snapshot</h2>
        <div className="kpi-snapshot-grid">
          {kpiTiles.map((tile) => (
            <div
              key={tile.label}
              className={`kpi-snapshot-tile${tile.accent ? ' kpi-snapshot-accent' : ''}`}
            >
              <span className={`kpi-snapshot-value${tile.accent ? ' kpi-snapshot-value-accent' : ''}`}>
                {tile.value}
              </span>
              <span className="kpi-snapshot-label">{tile.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── 2. Fleet Activity (compact) ─────────────────────────────────── */}
      {statement.trips.length > 0 && (
        <section className="statement-section statement-section-compact">
          <h2 className="statement-section-title">Fleet Activity</h2>
          <div className="fleet-metrics-row">
            <div className="fleet-metric">
              <span className="fleet-metric-value">{statement.trips.length}</span>
              <span className="fleet-metric-label">Trips</span>
            </div>
            {totalRentalDays > 0 && (
              <div className="fleet-metric">
                <span className="fleet-metric-value">{avgTripLength.toFixed(1)}</span>
                <span className="fleet-metric-label">Avg Trip Days</span>
              </div>
            )}
            <div className="fleet-metric">
              <span className="fleet-metric-value">{statement.expenses.length}</span>
              <span className="fleet-metric-label">Expense Items</span>
            </div>
            <div className="fleet-metric">
              <span className="fleet-metric-value">{daysInPeriod}</span>
              <span className="fleet-metric-label">Days in Period</span>
            </div>
          </div>
        </section>
      )}

      {/* ── 3. Trip Activity ────────────────────────────────────────────── */}
      <section className="statement-section">
        <h2 className="statement-section-title">
          Trip Activity &nbsp;
          <span className="statement-section-period">{statement.monthLabel}</span>
        </h2>

        {statement.trips.length === 0 ? (
          <p className="statement-no-data">No rental activity for this period.</p>
        ) : (
          <div className="statement-table-scroll">
            <table className="statement-table">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Trip Start</th>
                  <th>Trip End</th>
                  <th className="col-center">Days</th>
                  <th className="col-currency">Gross</th>
                  <th className="col-currency">Platform Fee</th>
                  <th className="col-currency">Mgmt Fee</th>
                  <th className="col-currency">Net to Owner</th>
                </tr>
              </thead>
              <tbody>
                {statement.trips.map((trip, index) => (
                  <tr key={trip.tripId} className={index % 2 === 0 ? 'row-even' : 'row-odd'}>
                    <td className="col-vehicle">{trip.vehicle}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(trip.tripStart)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(trip.tripEnd)}</td>
                    <td className="col-center">{trip.days}</td>
                    <td className="col-currency">{fmtCurrency(trip.grossRevenue)}</td>
                    <td className="col-currency col-deduction">
                      {trip.turoFees > 0 ? fmtNeg(trip.turoFees) : '—'}
                    </td>
                    <td className="col-currency col-deduction">
                      {trip.managementFees > 0 ? fmtNeg(trip.managementFees) : '—'}
                    </td>
                    <td className="col-currency col-net">{fmtCurrency(trip.netToOwner)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="statement-totals-row">
                  <td colSpan={4} className="totals-label">Totals</td>
                  <td className="col-currency">{fmtCurrency(statement.totalGrossRevenue)}</td>
                  <td className="col-currency col-deduction">
                    {statement.totalTuroFees > 0 ? fmtNeg(statement.totalTuroFees) : '—'}
                  </td>
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

      {/* ── 4. Operating Expenses ───────────────────────────────────────── */}
      <section className="statement-section">
        <h2 className="statement-section-title">
          Operating Expenses &nbsp;
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
                  <th>Description</th>
                  <th className="col-currency">Amount</th>
                </tr>
              </thead>
              <tbody>
                {statement.expenses.map((exp, index) => (
                  <tr key={exp.id} className={index % 2 === 0 ? 'row-even' : 'row-odd'}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(exp.date)}</td>
                    <td>{exp.description}</td>
                    <td className="col-currency col-deduction">
                      {exp.amount > 0 ? fmtNeg(exp.amount) : fmtCurrency(exp.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="statement-totals-row">
                  <td colSpan={2} className="totals-label">Total Operating Expenses</td>
                  <td className="col-currency col-deduction">
                    {statement.totalExpenses > 0 ? fmtNeg(statement.totalExpenses) : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* ── 5. Earnings Summary ─────────────────────────────────────────── */}
      <section className="statement-summary-section">
        <h2 className="statement-section-title">Earnings Summary</h2>
        <div className="statement-summary-wrap">
          <div className="earnings-summary-box">
            <div className="earnings-line">
              <span>Gross Revenue</span>
              <span className="earnings-amount">{fmtCurrency(statement.totalGrossRevenue)}</span>
            </div>
            <div className="earnings-line earnings-deduction">
              <span>Less Platform Fees</span>
              <span className="earnings-amount">
                {statement.totalTuroFees > 0 ? fmtNeg(statement.totalTuroFees) : '—'}
              </span>
            </div>
            <div className="earnings-line earnings-deduction">
              <span>Less Fleet Management Fee</span>
              <span className="earnings-amount">
                {statement.totalManagementFees > 0 ? fmtNeg(statement.totalManagementFees) : '—'}
              </span>
            </div>
            <div className="earnings-line earnings-deduction">
              <span>Less Operating Expenses</span>
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
