import type { CompanySettings, OwnerStatement } from '../lib/types';

function fmtCurrency(value: number): string {
  return value.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
  const sectionNetTotal =
    statement.totalGrossRevenue - statement.totalTuroFees - statement.totalManagementFees;

  return (
    <article className="statement-doc">
      {/* ===== LETTERHEAD ===== */}
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

      {/* ===== TWO-COLUMN HEADER INFO ===== */}
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

      {/* ===== SECTION 1: RENTAL ACCOUNT ACTIVITY ===== */}
      <section className="statement-section">
        <h2 className="statement-section-title">
          Section 1 — Rental Account Activity &nbsp;
          <span className="statement-section-period">
            {statement.monthLabel}
          </span>
        </h2>

        {statement.trips.length === 0 ? (
          <p className="statement-no-data">No rental activity for this period.</p>
        ) : (
          <div className="statement-table-scroll">
            <table className="statement-table">
              <thead>
                <tr>
                  <th>Trip ID</th>
                  <th>Vehicle</th>
                  <th>Renter</th>
                  <th>Trip Start</th>
                  <th>Trip End</th>
                  <th className="col-center">Days</th>
                  <th className="col-currency">Gross Revenue</th>
                  <th className="col-currency">Turo Fees</th>
                  <th className="col-currency">Mgmt Fees</th>
                  <th className="col-currency">Net to Owner</th>
                </tr>
              </thead>
              <tbody>
                {statement.trips.map((trip, index) => (
                  <tr key={trip.tripId} className={index % 2 === 0 ? 'row-even' : 'row-odd'}>
                    <td className="col-muted">{trip.tripId}</td>
                    <td>{trip.vehicle}</td>
                    <td>{trip.renter}</td>
                    <td>{formatDate(trip.tripStart)}</td>
                    <td>{formatDate(trip.tripEnd)}</td>
                    <td className="col-center">{trip.days}</td>
                    <td className="col-currency">{fmtCurrency(trip.grossRevenue)}</td>
                    <td className="col-currency col-deduction">{fmtCurrency(trip.turoFees)}</td>
                    <td className="col-currency col-deduction">{fmtCurrency(trip.managementFees)}</td>
                    <td className="col-currency col-net">{fmtCurrency(trip.netToOwner)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="statement-totals-row">
                  <td colSpan={6} className="totals-label">Section 1 Totals</td>
                  <td className="col-currency">{fmtCurrency(statement.totalGrossRevenue)}</td>
                  <td className="col-currency">{fmtCurrency(statement.totalTuroFees)}</td>
                  <td className="col-currency">{fmtCurrency(statement.totalManagementFees)}</td>
                  <td className="col-currency col-net">{fmtCurrency(sectionNetTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* ===== SECTION 2: REIMBURSABLE EXPENSES ===== */}
      <section className="statement-section">
        <h2 className="statement-section-title">
          Section 2 — Reimbursable Expenses &nbsp;
          <span className="statement-section-period">{statement.monthLabel}</span>
        </h2>

        {statement.expenses.length === 0 ? (
          <p className="statement-no-data">No expenses recorded for this period.</p>
        ) : (
          <div className="statement-table-scroll">
            <table className="statement-table statement-table-expenses">
              <thead>
                <tr>
                  <th>ID #</th>
                  <th>Description</th>
                  <th>Date</th>
                  <th className="col-currency">Amount</th>
                </tr>
              </thead>
              <tbody>
                {statement.expenses.map((exp, index) => (
                  <tr key={exp.id} className={index % 2 === 0 ? 'row-even' : 'row-odd'}>
                    <td className="col-muted">{exp.id}</td>
                    <td>{exp.description}</td>
                    <td>{exp.date}</td>
                    <td className="col-currency col-deduction">{fmtCurrency(exp.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="statement-totals-row">
                  <td colSpan={3} className="totals-label">Total Expenses</td>
                  <td className="col-currency">{fmtCurrency(statement.totalExpenses)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* ===== SUMMARY ===== */}
      <section className="statement-summary-section">
        <h2 className="statement-section-title">Summary</h2>
        <div className="statement-summary-wrap">
          <div className="statement-summary-lines">
            <div className="summary-line">
              <span>Gross Rental Revenue</span>
              <span className="summary-amount">{fmtCurrency(statement.totalGrossRevenue)}</span>
            </div>
            <div className="summary-line summary-deduction">
              <span>Less Turo Fees</span>
              <span className="summary-amount">({fmtCurrency(statement.totalTuroFees)})</span>
            </div>
            <div className="summary-line summary-deduction">
              <span>Less Management Fees</span>
              <span className="summary-amount">({fmtCurrency(statement.totalManagementFees)})</span>
            </div>
            <div className="summary-line summary-deduction">
              <span>Less Rental Expenses</span>
              <span className="summary-amount">({fmtCurrency(statement.totalExpenses)})</span>
            </div>
          </div>

          <div className="balance-callout">
            <span className="balance-label">Total Balance Due Vehicle Owner</span>
            <span className="balance-amount">{fmtCurrency(statement.totalBalanceDueOwner)}</span>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="statement-doc-footer">
        <p>
          This statement was generated by Turo Codex on {formatDate(statement.statementDate)}.
        </p>
        {company.email && (
          <p>Questions? Contact {company.email}.</p>
        )}
      </footer>
    </article>
  );
}
