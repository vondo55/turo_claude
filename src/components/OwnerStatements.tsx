import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { buildOwnerStatements } from '../lib/metrics';
import { supabase } from '../lib/supabase';
import type { CompanySettings, OwnerStatement, OwnerStatementExpense, TuroTripRecord } from '../lib/types';
import CompanySettingsModal, { loadCompanySettings, saveCompanySettings } from './CompanySettingsModal';
import OwnerStatementDocument from './OwnerStatementDocument';

const MOCK_EXPENSES: OwnerStatementExpense[] = [
  { id: 'mock-1', description: 'Tire Repair at Lamb\'s Autobody', date: '2025-01-08', amount: 95.0 },
  { id: 'mock-2', description: 'Oil Change', date: '2025-01-15', amount: 64.99 },
];

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabelFromKey(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

type OwnerStatementsProps = {
  records: TuroTripRecord[];
  isSignedIn: boolean;
  session: Session | null;
};

export default function OwnerStatements({ records, isSignedIn }: OwnerStatementsProps) {
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedOwner, setSelectedOwner] = useState<string>('all');
  const [companySettings, setCompanySettings] = useState<CompanySettings>(() => loadCompanySettings());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [expenses, setExpenses] = useState<OwnerStatementExpense[]>([]);
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [sendPayTarget, setSendPayTarget] = useState<OwnerStatement | null>(null);
  const [sendPayConfirmed, setSendPayConfirmed] = useState(false);

  // Month options derived from records, sorted newest-first
  const monthOptions = useMemo(() => {
    const unique = new Set(records.map((r) => monthKey(r.tripEnd)));
    return Array.from(unique)
      .sort((a, b) => b.localeCompare(a))
      .map((value) => ({ value, label: monthLabelFromKey(value) }));
  }, [records]);

  // Auto-select most recent month on first load
  useEffect(() => {
    if (monthOptions.length > 0 && !selectedMonth) {
      setSelectedMonth(monthOptions[0].value);
    }
  }, [monthOptions, selectedMonth]);

  // Owner options derived from records
  const ownerOptions = useMemo(() => {
    const unique = new Set(records.map((r) => r.ownerName));
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [records]);

  // Load expenses for selected month
  useEffect(() => {
    if (!selectedMonth) return;
    setExpensesLoading(true);

    if (isSignedIn && supabase) {
      supabase
        .from('expense_submissions')
        .select('id, expense_date, description, amount, vehicle')
        .like('expense_date', `${selectedMonth}-%`)
        .order('expense_date', { ascending: true })
        .then(({ data, error }) => {
          if (error || !data) {
            setExpenses([]);
          } else {
            setExpenses(
              data.map((row) => ({
                id: String(row.id),
                description: String(row.description ?? ''),
                date: String(row.expense_date ?? ''),
                amount: Number(row.amount ?? 0),
                // Store owner info extracted from vehicle string for grouping
                _ownerFromVehicle: (() => {
                  if (typeof row.vehicle !== 'string') return '';
                  const parts = row.vehicle.split(' | ');
                  return (parts[parts.length - 1] ?? '').trim();
                })(),
              })) as OwnerStatementExpense[]
            );
          }
          setExpensesLoading(false);
        });
    } else {
      // Use mock data when not signed in; filter to selected month
      setExpenses(MOCK_EXPENSES.filter((e) => e.date.startsWith(selectedMonth)));
      setExpensesLoading(false);
    }
  }, [selectedMonth, isSignedIn]);

  // Build one statement per owner for selected month
  const statements = useMemo((): OwnerStatement[] => {
    if (!selectedMonth || records.length === 0) return [];

    // Filter records to selected month
    const monthRecords = records.filter((r) => monthKey(r.tripEnd) === selectedMonth);
    if (monthRecords.length === 0) return [];

    const label = monthLabelFromKey(selectedMonth);

    // Group expenses by owner extracted from vehicle string
    const expensesByOwner = new Map<string, OwnerStatementExpense[]>();
    for (const exp of expenses) {
      // _ownerFromVehicle is injected in the Supabase path; fallback to empty
      const ownerKey = (exp as OwnerStatementExpense & { _ownerFromVehicle?: string })._ownerFromVehicle ?? '';
      const list = expensesByOwner.get(ownerKey) ?? [];
      list.push(exp);
      expensesByOwner.set(ownerKey, list);
    }

    // Group trip records by owner
    const recordsByOwner = new Map<string, TuroTripRecord[]>();
    for (const r of monthRecords) {
      const list = recordsByOwner.get(r.ownerName) ?? [];
      list.push(r);
      recordsByOwner.set(r.ownerName, list);
    }

    // Build one statement per owner
    const result: OwnerStatement[] = [];
    for (const [ownerName, ownerRecords] of recordsByOwner.entries()) {
      const ownerExpenses = expensesByOwner.get(ownerName) ?? [];
      result.push(buildOwnerStatements(ownerRecords, label, selectedMonth, ownerExpenses));
    }

    return result.sort((a, b) => a.ownerName.localeCompare(b.ownerName));
  }, [records, selectedMonth, expenses]);

  const visibleStatements =
    selectedOwner === 'all'
      ? statements
      : statements.filter((s) => s.ownerName === selectedOwner);

  function handlePrint() {
    window.print();
  }

  return (
    <section className="statements-panel">
      {/* Toolbar */}
      <div className="statements-toolbar no-print">
        <h2 className="statements-title">Owner Statements</h2>
        <div className="statements-controls">
          <label>
            Period
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              disabled={monthOptions.length === 0}
            >
              {monthOptions.length === 0 && <option value="">No data</option>}
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Owner
            <select value={selectedOwner} onChange={(e) => setSelectedOwner(e.target.value)}>
              <option value="all">All Owners ({statements.length})</option>
              {ownerOptions.map((owner) => (
                <option key={owner} value={owner}>
                  {owner}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="ghost-button"
            onClick={() => setIsSettingsOpen(true)}
          >
            Company Settings
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={handlePrint}
            disabled={visibleStatements.length === 0}
          >
            Print / Save PDF
          </button>
        </div>
      </div>

      {expensesLoading && <p className="status">Loading expenses…</p>}

      {records.length === 0 && (
        <div className="statements-empty-state">
          <p>Upload a CSV to generate owner statements.</p>
        </div>
      )}

      {/* Statement preview area */}
      <div className="statements-preview-area">
        {visibleStatements.map((stmt) => (
          <div key={stmt.ownerName} className="statement-wrapper">
            {/* Action bar (hidden on print) */}
            <div className="statement-action-bar no-print">
              <span className="statement-owner-chip">{stmt.ownerName}</span>
              <div className="statement-action-bar-right">
                <span className="statement-period-chip">{stmt.monthLabel}</span>
                <button
                  type="button"
                  className="btn-send-pay"
                  onClick={() => {
                    setSendPayTarget(stmt);
                    setSendPayConfirmed(false);
                  }}
                >
                  Send &amp; Pay
                </button>
              </div>
            </div>

            <OwnerStatementDocument statement={stmt} company={companySettings} />
          </div>
        ))}
      </div>

      {/* Company Settings Modal */}
      <CompanySettingsModal
        isOpen={isSettingsOpen}
        settings={companySettings}
        onSave={(next) => {
          setCompanySettings(next);
          saveCompanySettings(next);
        }}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Send & Pay Modal */}
      {sendPayTarget && (
        <div
          className="modal-overlay"
          onClick={() => setSendPayTarget(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Send and Pay"
        >
          <div className="modal-box send-pay-modal" onClick={(e) => e.stopPropagation()}>
            {!sendPayConfirmed ? (
              <>
                <div className="modal-header">
                  <h2>Send Statement &amp; Initiate Payment</h2>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => setSendPayTarget(null)}
                  >
                    Cancel
                  </button>
                </div>
                <div className="send-pay-body">
                  <p className="send-pay-owner">
                    Sending statement to: <strong>{sendPayTarget.ownerName}</strong>
                  </p>
                  <p className="send-pay-period">
                    Period: <strong>{sendPayTarget.monthLabel}</strong>
                  </p>
                  <div className="send-pay-amount-preview">
                    <span>Balance Due to Owner</span>
                    <span className="send-pay-amount">
                      {sendPayTarget.totalBalanceDueOwner.toLocaleString(undefined, {
                        style: 'currency',
                        currency: 'USD',
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <p className="send-pay-note">
                    This will log a payment record. Actual email delivery is coming soon.
                  </p>
                  <div className="send-pay-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => setSendPayTarget(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => setSendPayConfirmed(true)}
                    >
                      Confirm Send &amp; Pay
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="modal-header">
                  <h2>✓ Statement Queued</h2>
                </div>
                <div className="send-pay-body">
                  <p className="send-pay-success">
                    Statement for <strong>{sendPayTarget.ownerName}</strong> has been marked for
                    payment of{' '}
                    <strong>
                      {sendPayTarget.totalBalanceDueOwner.toLocaleString(undefined, {
                        style: 'currency',
                        currency: 'USD',
                        minimumFractionDigits: 2,
                      })}
                    </strong>
                    .
                  </p>
                  <p className="send-pay-note">
                    Email delivery and payment processing are pending future integration.
                  </p>
                  <div className="send-pay-actions">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => setSendPayTarget(null)}
                    >
                      Done
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
