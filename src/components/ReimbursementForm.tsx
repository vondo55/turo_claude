import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  getExpenseSubmissionHistory,
  saveExpenseSubmissionToSupabase,
  type ExpenseSubmissionHistoryItem,
  type SaveExpenseSubmissionInput,
} from '../lib/supabase';

export type ReceiptPrefillSeed = {
  token: string;
  documentIds: string[];
  inferredDate: string | null;
  inferredAmount: number | null;
  inferredDescription: string | null;
  sourceFileNames: string[];
};

type ReimbursementFormProps = {
  isSignedIn: boolean;
  prefillSeed: ReceiptPrefillSeed | null;
  onClearPrefillSeed: () => void;
};

type FormState = {
  requester: string;
  requesterOther: string;
  expenseDate: string;
  amount: string;
  errandAmount: string;
  errandOther: string;
  description: string;
  descriptionOther: string;
  paidPersonalCard: 'yes' | 'no' | '';
  vehicle: string;
  vehicleOther: string;
  receiptDocumentIds: string[];
};

const requesterOptions = ['David Robledo', 'Kenneth Haight', 'Tyler Chen', 'Robert Getino', 'Christian Guzman'] as const;

const descriptionOptions = [
  'LAX Parking Reimbursement',
  'LGB Parking Reimbursement',
  'SNA Parking Reimbursement',
  'Fuel Reimbursement',
  'Oil Change Fee',
  'Turo Inspection Fee',
  'Car Wash Reimbursement',
  'Toll Reimbursement',
  'Parking Ticket Reimbursement',
] as const;

const errandOptions = ['-30', '-60', '0'] as const;

const vehicleOptions = [
  '2016 BMW 2 Series [9BTL985] | David Robledo',
  '2021 BMW 430i Convertible (white) [3wsm762] | Henrik Frank',
  '2023 BMW M3 (Yellow) [412123D] | Ehsan Shirazi',
  '2022 BMW Z4 (White) [9HGA746] | Henrik Frank',
  '2022 Chevy Suburban [9ENB502] | James Sun',
  '2022 Chrysler Pacifica PHEV (White) [9LBK896] | Enkh-Erdene Bayarsaikhan',
  '2020 Ford Fusion [9BWU524] | Justin Abitago',
  '2021 Honda Civic [9CHA686] | Steven Hernandez',
  '2022 Hyundai Kona [8WVM512] | Becca Prins',
  '2024 Hyundai Palisade (White) [9NDH322] | Lesly Yankelevich',
  '2023 Hyundai Santa Fe (Black) [9JDN062] | Kevin Oh',
  '2018 Jeep Renegade [9HPT994] | Tyler Chen',
  '2020 Kia Niro (Deep Cerulean) [8WAP125] | Miriam Antonio Hernandez',
  '2022 Kia Niro EV EX PREM WHITE [9AZR696] | Christopher Hepburn',
  '2024 Mazda CX-90 PHEV (White) [9GKJ786] | Enkh-Erdene Bayarsaikhan',
  '2024 Mercedes GLE 350 [9JYT862] | Oscar Sermana',
  '2023 Mercedes-Benz GLB 250 SUV (Blue) [BB MYAH] | Miriam Antonio Hernandez',
  '2020 Nissan Sentra (Black) [8SAR891] | Lucy Munoz',
  '2024 Tesla Cybertruck [75999A4] | Shawn Button',
  '2023 Tesla Model 3 (White) [9JSL691] | Julia Ianni',
  '2020 Tesla Model Y (Black) [69456Z3] | Robert Getino',
  '2024 Tesla Model Y (Grey) [9PIR474] | Arik Akhverdyan',
  '2023 Toyota Corolla white [9HXY103] | James Sun',
  '2025 Toyota Grand Highlander (Blue Fury) [] | Ehsan Shirazi',
  '2025 Toyota Grand Highlander (Grey) [] | Ehsan Shirazi',
  '2024 Toyota Sienna (Black) [Black Stallion] [414637D] | Ehsan Shirazi',
  '2024 Toyota Sienna (Blue) [433630D] | Ehsan Shirazi',
  '2025 Toyota Sienna (Green) [] | Ehsan Shirazi',
  '2024 Toyota Sienna (Grey) [Savage Wagon] [409551D] | Ehsan Shirazi',
  '2025 Toyota Sienna (Red) [] | Ehsan Shirazi',
  '2025 Toyota Sienna (Stone Gray) [5806939] | Viet Hong',
  '2025 Toyota Sienna (White) [ENA537] | Viet Hong',
  '2024 Volkswagen Atlas [9NCX654] | Lesly Yankelevich',
  '2019 Volkswagen Tiguan SE (Gray) [DB71M92] | Jiapeng Zhao',
] as const;

const initialFormState: FormState = {
  requester: '',
  requesterOther: '',
  expenseDate: '',
  amount: '',
  errandAmount: '',
  errandOther: '',
  description: '',
  descriptionOther: '',
  paidPersonalCard: '',
  vehicle: '',
  vehicleOther: '',
  receiptDocumentIds: [],
};

function toCurrency(value: number): string {
  return value.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function requiredFieldErrors(form: FormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.requester.trim()) errors.requester = 'Requester is required.';
  if (form.requester === 'Other' && !form.requesterOther.trim()) errors.requesterOther = 'Enter requester name.';
  if (!form.expenseDate) errors.expenseDate = 'Date is required.';
  if (!form.amount.trim() || Number.isNaN(Number(form.amount))) errors.amount = 'Valid cost amount is required.';
  if (!form.description.trim()) errors.description = 'Description is required.';
  if (form.description === 'Other' && !form.descriptionOther.trim()) errors.descriptionOther = 'Enter a description.';
  if (!form.paidPersonalCard) errors.paidPersonalCard = 'Choose whether personal card was used.';
  if (!form.vehicle.trim()) errors.vehicle = 'Vehicle is required.';
  if (form.vehicle === 'Other' && !form.vehicleOther.trim()) errors.vehicleOther = 'Enter vehicle details.';
  return errors;
}

function asIsoDate(dateLike: string | null | undefined): string {
  if (!dateLike) return '';
  const parsed = new Date(dateLike);
  if (Number.isNaN(parsed.getTime())) return '';
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${parsed.getFullYear()}-${month}-${day}`;
}

export default function ReimbursementForm({
  isSignedIn,
  prefillSeed,
  onClearPrefillSeed,
}: ReimbursementFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<FormState>(initialFormState);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitInfo, setSubmitInfo] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [history, setHistory] = useState<ExpenseSubmissionHistoryItem[]>([]);
  const [showErrors, setShowErrors] = useState(false);

  const errors = useMemo(() => requiredFieldErrors(form), [form]);
  const missingFields = useMemo(() => Object.keys(errors), [errors]);

  useEffect(() => {
    if (!prefillSeed) return;
    setIsOpen(true);
    setForm((current) => ({
      ...current,
      expenseDate: current.expenseDate || asIsoDate(prefillSeed.inferredDate),
      amount:
        current.amount ||
        (typeof prefillSeed.inferredAmount === 'number' && Number.isFinite(prefillSeed.inferredAmount)
          ? String(prefillSeed.inferredAmount)
          : ''),
      description: current.description || prefillSeed.inferredDescription || '',
      receiptDocumentIds: Array.from(new Set([...current.receiptDocumentIds, ...prefillSeed.documentIds])),
    }));
    setSubmitInfo(
      prefillSeed.sourceFileNames.length > 0
        ? `Receipt uploaded (${prefillSeed.sourceFileNames.join(
            ', '
          )}). Form prefilled where possible. Complete highlighted required fields.`
        : 'Reimbursement form opened. Complete highlighted required fields.'
    );
    setShowErrors(true);
    onClearPrefillSeed();
  }, [onClearPrefillSeed, prefillSeed]);

  useEffect(() => {
    if (!isSignedIn) {
      setHistory([]);
      setHistoryError(null);
      return;
    }

    let cancelled = false;
    async function loadHistory() {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const rows = await getExpenseSubmissionHistory(20);
        if (!cancelled) setHistory(rows);
      } catch (caughtError) {
        if (!cancelled) {
          setHistoryError(caughtError instanceof Error ? caughtError.message : 'Failed to load reimbursement history.');
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowErrors(true);
    setSubmitError(null);
    setSubmitInfo(null);

    const nextErrors = requiredFieldErrors(form);
    if (Object.keys(nextErrors).length > 0) {
      setSubmitError('Please complete required fields before saving.');
      return;
    }

    const payload: SaveExpenseSubmissionInput = {
      requesterName: form.requester === 'Other' ? form.requesterOther.trim() : form.requester,
      expenseDate: form.expenseDate,
      amount: Number(form.amount),
      errandAmount: form.errandAmount.trim() ? Number(form.errandAmount) : null,
      description: form.description === 'Other' ? form.descriptionOther.trim() : form.description,
      paidPersonalCard: form.paidPersonalCard === 'yes',
      vehicle: form.vehicle === 'Other' ? form.vehicleOther.trim() : form.vehicle,
      receiptDocumentIds: form.receiptDocumentIds,
      metadata: {
        errandOther: form.errandAmount === 'Other' ? form.errandOther.trim() : null,
      },
    };

    setIsSaving(true);
    try {
      await saveExpenseSubmissionToSupabase(payload);
      setSubmitInfo('Saved reimbursement submission to Supabase.');
      setForm(initialFormState);
      setShowErrors(false);
      const rows = await getExpenseSubmissionHistory(20);
      setHistory(rows);
    } catch (caughtError) {
      setSubmitError(caughtError instanceof Error ? caughtError.message : 'Failed to save reimbursement submission.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="reimbursement-panel">
      <div className="history-header">
        <h2>Reimbursement Form</h2>
        <button type="button" onClick={() => setIsOpen((current) => !current)}>
          {isOpen ? 'Hide form' : 'Open form'}
        </button>
      </div>
      <p className="subhead">
        Reproduces your Google Form inside the app and writes entries to Supabase. Required fields are highlighted.
      </p>

      {!isSignedIn ? <p className="status">Sign in to save reimbursements to Supabase.</p> : null}

      {isOpen ? (
        <form className="reimbursement-form" onSubmit={handleSubmit}>
          <label>
            Who are ya bro?*
            <select
              className={showErrors && errors.requester ? 'field-error' : ''}
              value={form.requester}
              onChange={(event) => setForm((current) => ({ ...current, requester: event.target.value }))}
              disabled={!isSignedIn}
            >
              <option value="">Select</option>
              {requesterOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
              <option value="Other">Other</option>
            </select>
          </label>

          {form.requester === 'Other' ? (
            <label>
              Other requester name*
              <input
                className={showErrors && errors.requesterOther ? 'field-error' : ''}
                value={form.requesterOther}
                onChange={(event) => setForm((current) => ({ ...current, requesterOther: event.target.value }))}
                disabled={!isSignedIn}
              />
            </label>
          ) : null}

          <label>
            Date*
            <input
              type="date"
              className={showErrors && errors.expenseDate ? 'field-error' : ''}
              value={form.expenseDate}
              onChange={(event) => setForm((current) => ({ ...current, expenseDate: event.target.value }))}
              disabled={!isSignedIn}
            />
          </label>

          <label>
            Cost* (negative means client owes us; positive means we owe client)
            <input
              type="number"
              step="0.01"
              className={showErrors && errors.amount ? 'field-error' : ''}
              value={form.amount}
              onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
              disabled={!isSignedIn}
            />
          </label>

          <label>
            Errand?
            <select
              value={form.errandAmount}
              onChange={(event) => setForm((current) => ({ ...current, errandAmount: event.target.value }))}
              disabled={!isSignedIn}
            >
              <option value="">None</option>
              {errandOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
              <option value="Other">Other</option>
            </select>
          </label>

          {form.errandAmount === 'Other' ? (
            <label>
              Other errand amount
              <input
                value={form.errandOther}
                onChange={(event) => setForm((current) => ({ ...current, errandOther: event.target.value }))}
                disabled={!isSignedIn}
              />
            </label>
          ) : null}

          <label>
            Description*
            <select
              className={showErrors && errors.description ? 'field-error' : ''}
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              disabled={!isSignedIn}
            >
              <option value="">Select</option>
              {descriptionOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
              <option value="Other">Other</option>
            </select>
          </label>

          {form.description === 'Other' ? (
            <label>
              Other description*
              <input
                className={showErrors && errors.descriptionOther ? 'field-error' : ''}
                value={form.descriptionOther}
                onChange={(event) => setForm((current) => ({ ...current, descriptionOther: event.target.value }))}
                disabled={!isSignedIn}
              />
            </label>
          ) : null}

          <fieldset className={showErrors && errors.paidPersonalCard ? 'field-error' : ''}>
            <legend>Did you pay with your own card?*</legend>
            <label>
              <input
                type="radio"
                checked={form.paidPersonalCard === 'yes'}
                onChange={() => setForm((current) => ({ ...current, paidPersonalCard: 'yes' }))}
                disabled={!isSignedIn}
              />
              Yes, reimburse me.
            </label>
            <label>
              <input
                type="radio"
                checked={form.paidPersonalCard === 'no'}
                onChange={() => setForm((current) => ({ ...current, paidPersonalCard: 'no' }))}
                disabled={!isSignedIn}
              />
              No
            </label>
          </fieldset>

          <label>
            Vehicle*
            <select
              className={showErrors && errors.vehicle ? 'field-error' : ''}
              value={form.vehicle}
              onChange={(event) => setForm((current) => ({ ...current, vehicle: event.target.value }))}
              disabled={!isSignedIn}
            >
              <option value="">Select</option>
              {vehicleOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
              <option value="Other">Other</option>
            </select>
          </label>

          {form.vehicle === 'Other' ? (
            <label>
              Other vehicle*
              <input
                className={showErrors && errors.vehicleOther ? 'field-error' : ''}
                value={form.vehicleOther}
                onChange={(event) => setForm((current) => ({ ...current, vehicleOther: event.target.value }))}
                disabled={!isSignedIn}
              />
            </label>
          ) : null}

          <label>
            Receipt document ids
            <textarea value={form.receiptDocumentIds.join('\n')} readOnly />
          </label>

          {showErrors && missingFields.length > 0 ? (
            <p className="error">Missing required fields: {missingFields.join(', ')}</p>
          ) : null}
          {submitError ? <p className="error">{submitError}</p> : null}
          {submitInfo ? <p className="status">{submitInfo}</p> : null}

          <button type="submit" disabled={!isSignedIn || isSaving}>
            {isSaving ? 'Saving...' : 'Save reimbursement to Supabase'}
          </button>
        </form>
      ) : null}

      <article className="table-card">
        <h3>Recent Reimbursement Submissions</h3>
        {historyLoading ? <p className="status">Loading...</p> : null}
        {historyError ? <p className="error">{historyError}</p> : null}
        {history.length === 0 ? (
          <p className="status">No reimbursement submissions yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Created</th>
                <th>Requester</th>
                <th>Date</th>
                <th>Cost</th>
                <th>Description</th>
                <th>Vehicle</th>
                <th>Receipts</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.createdAt).toLocaleString()}</td>
                  <td>{row.requesterName}</td>
                  <td>{row.expenseDate}</td>
                  <td>{toCurrency(row.amount)}</td>
                  <td>{row.description}</td>
                  <td>{row.vehicle}</td>
                  <td>{row.receiptDocumentIds.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
    </section>
  );
}
