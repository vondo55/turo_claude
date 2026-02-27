import { useState } from 'react';
import {
  DEFAULT_OWNER_PCT,
  type FeeSettings,
  type SplitRatioKey,
  resolvedOwnerPct,
  saveFeeSettings,
} from '../lib/feeSettings';

type FeeSettingsPanelProps = {
  settings: FeeSettings;
  onSettingsChange: (next: FeeSettings) => void;
};

type SectionDef = {
  title: string;
  description: string;
  keys: SplitRatioKey[];
};

const SECTIONS: SectionDef[] = [
  {
    title: 'Core Revenue',
    description: 'Primary trip earnings and usage charges',
    keys: ['Trip price', 'Boost price', 'Cancellation fee', 'Additional usage'],
  },
  {
    title: 'Discounts',
    description: 'Multi-day and promotional discount splits',
    keys: [
      '3-day discount',
      '1-week discount',
      '2-week discount',
      '3-week discount',
      '1-month discount',
      '2-month discount',
      '3-month discount',
      'Non-refundable discount',
      'Early bird discount',
      'Host promotional credit',
    ],
  },
  {
    title: 'Fees & Penalties',
    description: 'Damage, violation, and distance fees',
    keys: ['Excess distance', 'Smoking', 'Delivery', 'Fines (paid to host)'],
  },
  {
    title: 'Operational (Host Retains)',
    description: 'Platform fees and pass-through charges — host keeps by default',
    keys: [
      'Extras',
      'Gas reimbursement',
      'Cleaning',
      'Late fee',
      'Improper return fee',
      'Airport operations fee',
      'Airport parking credit',
      'On-trip EV charging',
      'Post-trip EV charging',
      'Tolls & tickets',
      'Other fees',
      'Gas fee',
      'Sales tax',
    ],
  },
];

export default function FeeSettingsPanel({ settings, onSettingsChange }: FeeSettingsPanelProps) {
  // Local draft: key → owner % (number | '' for empty input)
  const [draft, setDraft] = useState<Partial<Record<SplitRatioKey, number | ''>>>(() => {
    const initial: Partial<Record<SplitRatioKey, number | ''>> = {};
    for (const key of Object.keys(DEFAULT_OWNER_PCT) as SplitRatioKey[]) {
      initial[key] = resolvedOwnerPct(settings, key);
    }
    return initial;
  });
  const [saved, setSaved] = useState(false);

  function isDirty(key: SplitRatioKey): boolean {
    const draftVal = draft[key];
    if (draftVal === '' || draftVal === undefined) return false;
    return draftVal !== DEFAULT_OWNER_PCT[key];
  }

  function handleChange(key: SplitRatioKey, raw: string) {
    setSaved(false);
    if (raw === '') {
      setDraft((prev) => ({ ...prev, [key]: '' }));
      return;
    }
    const num = Number(raw);
    if (!Number.isFinite(num)) return;
    const clamped = Math.max(0, Math.min(100, Math.round(num)));
    setDraft((prev) => ({ ...prev, [key]: clamped }));
  }

  function handleReset() {
    setSaved(false);
    const reset: Partial<Record<SplitRatioKey, number | ''>> = {};
    for (const key of Object.keys(DEFAULT_OWNER_PCT) as SplitRatioKey[]) {
      reset[key] = DEFAULT_OWNER_PCT[key];
    }
    setDraft(reset);
    const next: FeeSettings = { version: 1, overrides: {} };
    saveFeeSettings(next);
    onSettingsChange(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  function handleSave() {
    const overrides: Partial<Record<SplitRatioKey, number>> = {};
    for (const key of Object.keys(DEFAULT_OWNER_PCT) as SplitRatioKey[]) {
      const val = draft[key];
      if (val !== '' && val !== undefined && val !== DEFAULT_OWNER_PCT[key]) {
        overrides[key] = val as number;
      }
    }
    const next: FeeSettings = { version: 1, overrides };
    saveFeeSettings(next);
    onSettingsChange(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  const totalDirty = (Object.keys(DEFAULT_OWNER_PCT) as SplitRatioKey[]).filter(isDirty).length;

  return (
    <section className="fee-settings-panel">
      <div className="fee-settings-header no-print">
        <div>
          <h2 className="fee-settings-title">Fee Arrangement Settings</h2>
          <p className="fee-settings-subtitle">
            Configure how revenue is split between the vehicle owner and the host (fleet manager) for each line item.
            These rates apply when processing new CSV uploads.
          </p>
        </div>
        <div className="fee-settings-header-actions">
          {totalDirty > 0 && (
            <span className="fee-dirty-badge">{totalDirty} unsaved change{totalDirty !== 1 ? 's' : ''}</span>
          )}
          <button type="button" className="ghost-button" onClick={handleReset}>
            Reset to Defaults
          </button>
          <button type="button" className="btn-primary" onClick={handleSave}>
            Save Settings
          </button>
        </div>
      </div>

      {saved && (
        <div className="fee-save-banner" role="status">
          ✓ Settings saved. Re-upload your CSV to apply the new fee arrangement.
        </div>
      )}

      <div className="fee-sections">
        {SECTIONS.map((section) => (
          <div key={section.title} className="fee-section">
            <div className="fee-section-heading">
              <h3 className="fee-section-title">{section.title}</h3>
              <p className="fee-section-desc">{section.description}</p>
            </div>
            <div className="fee-table-scroll">
              <table className="fee-table">
                <thead>
                  <tr>
                    <th className="fee-col-item">Line Item</th>
                    <th className="fee-col-pct">Owner %</th>
                    <th className="fee-col-pct">Host %</th>
                    <th className="fee-col-default">Default Owner %</th>
                  </tr>
                </thead>
                <tbody>
                  {section.keys.map((key) => {
                    const dirty = isDirty(key);
                    const ownerVal = draft[key] ?? 0;
                    const hostPct = ownerVal === '' ? '' : 100 - (ownerVal as number);
                    return (
                      <tr key={key} className={dirty ? 'fee-row-dirty' : ''}>
                        <td className="fee-col-item">{key}</td>
                        <td className="fee-col-pct">
                          <div className="fee-pct-input-wrap">
                            <input
                              type="number"
                              className="fee-pct-input"
                              min={0}
                              max={100}
                              step={1}
                              value={ownerVal}
                              onChange={(e) => handleChange(key, e.target.value)}
                            />
                            <span className="fee-pct-symbol">%</span>
                          </div>
                        </td>
                        <td className="fee-col-pct fee-host-pct">
                          {hostPct === '' ? '—' : `${hostPct}%`}
                        </td>
                        <td className="fee-col-default fee-default-pct">
                          {DEFAULT_OWNER_PCT[key]}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <div className="fee-settings-footer no-print">
        <button type="button" className="ghost-button" onClick={handleReset}>
          Reset to Defaults
        </button>
        <button type="button" className="btn-primary" onClick={handleSave}>
          Save Settings
        </button>
      </div>
    </section>
  );
}
