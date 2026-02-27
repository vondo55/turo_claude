import { useState } from 'react';
import type { CompanySettings } from '../lib/types';

const COMPANY_SETTINGS_KEY = 'turo_company_settings_v1';

export function loadCompanySettings(): CompanySettings {
  try {
    const raw = localStorage.getItem(COMPANY_SETTINGS_KEY);
    if (raw) return JSON.parse(raw) as CompanySettings;
  } catch {
    // ignore
  }
  return {
    companyName: 'LR Fleet Management',
    street: '',
    cityStateZip: '',
    phone: '',
    email: '',
    logoText: 'LR',
  };
}

export function saveCompanySettings(s: CompanySettings): void {
  localStorage.setItem(COMPANY_SETTINGS_KEY, JSON.stringify(s));
}

type CompanySettingsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  settings: CompanySettings;
  onSave: (settings: CompanySettings) => void;
};

export default function CompanySettingsModal({ isOpen, onClose, settings, onSave }: CompanySettingsModalProps) {
  const [draft, setDraft] = useState<CompanySettings>(settings);

  if (!isOpen) return null;

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    onSave(draft);
    onClose();
  }

  function set(field: keyof CompanySettings, value: string) {
    setDraft((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Company Settings"
    >
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Management Company Settings</h2>
          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>
        <form onSubmit={handleSave} className="company-settings-form">
          <label className="form-field">
            Company Name *
            <input
              type="text"
              value={draft.companyName}
              onChange={(e) => set('companyName', e.target.value)}
              required
              placeholder="LR Fleet Management"
            />
          </label>
          <label className="form-field">
            Street Address
            <input
              type="text"
              value={draft.street ?? ''}
              onChange={(e) => set('street', e.target.value)}
              placeholder="123 Main St"
            />
          </label>
          <label className="form-field">
            City, State ZIP
            <input
              type="text"
              value={draft.cityStateZip ?? ''}
              onChange={(e) => set('cityStateZip', e.target.value)}
              placeholder="Los Angeles, CA 90001"
            />
          </label>
          <label className="form-field">
            Phone
            <input
              type="tel"
              value={draft.phone ?? ''}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="(555) 123-4567"
            />
          </label>
          <label className="form-field">
            Email
            <input
              type="email"
              value={draft.email ?? ''}
              onChange={(e) => set('email', e.target.value)}
              placeholder="info@lrfleet.com"
            />
          </label>
          <label className="form-field">
            Logo Initials
            <input
              type="text"
              value={draft.logoText ?? ''}
              onChange={(e) => set('logoText', e.target.value)}
              maxLength={3}
              placeholder="LR"
            />
            <small>2–3 characters shown in the letterhead logo mark</small>
          </label>
          <div className="form-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Save Settings
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
