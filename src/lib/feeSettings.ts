const STORAGE_KEY = 'turo_fee_settings_v1';

export type SplitRatioKey =
  | 'Trip price'
  | 'Boost price'
  | '3-day discount'
  | '1-week discount'
  | '2-week discount'
  | '3-week discount'
  | '1-month discount'
  | '2-month discount'
  | '3-month discount'
  | 'Non-refundable discount'
  | 'Early bird discount'
  | 'Host promotional credit'
  | 'Cancellation fee'
  | 'Additional usage'
  | 'Excess distance'
  | 'Smoking'
  | 'Delivery'
  | 'Extras'
  | 'Gas reimbursement'
  | 'Cleaning'
  | 'Late fee'
  | 'Improper return fee'
  | 'Airport operations fee'
  | 'Airport parking credit'
  | 'On-trip EV charging'
  | 'Post-trip EV charging'
  | 'Tolls & tickets'
  | 'Fines (paid to host)'
  | 'Other fees'
  | 'Gas fee'
  | 'Sales tax';

export type FeeSettings = {
  version: 1;
  /** owner % (integer 0–100) for any line items that differ from the default */
  overrides: Partial<Record<SplitRatioKey, number>>;
};

/** Default owner % for each line item — mirrors currentSplitRatios ownerBps ÷ 100 in csv.ts */
export const DEFAULT_OWNER_PCT: Record<SplitRatioKey, number> = {
  'Trip price': 70,
  'Boost price': 70,
  '3-day discount': 70,
  '1-week discount': 70,
  '2-week discount': 70,
  '3-week discount': 70,
  '1-month discount': 70,
  '2-month discount': 70,
  '3-month discount': 70,
  'Non-refundable discount': 70,
  'Early bird discount': 70,
  'Host promotional credit': 70,
  'Cancellation fee': 70,
  'Additional usage': 70,
  'Excess distance': 100,
  'Smoking': 10,
  'Delivery': 10,
  'Extras': 0,
  'Gas reimbursement': 0,
  'Cleaning': 0,
  'Late fee': 0,
  'Improper return fee': 0,
  'Airport operations fee': 0,
  'Airport parking credit': 0,
  'On-trip EV charging': 0,
  'Post-trip EV charging': 0,
  'Tolls & tickets': 0,
  'Fines (paid to host)': 100,
  'Other fees': 0,
  'Gas fee': 0,
  'Sales tax': 0,
};

/** Returns the resolved owner % for a given key, applying any overrides */
export function resolvedOwnerPct(settings: FeeSettings, key: SplitRatioKey): number {
  return settings.overrides[key] ?? DEFAULT_OWNER_PCT[key];
}

export function loadFeeSettings(): FeeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FeeSettings;
      if (parsed?.version === 1) return parsed;
    }
  } catch {
    // ignore parse errors
  }
  return { version: 1, overrides: {} };
}

export function saveFeeSettings(s: FeeSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

/**
 * Converts FeeSettings into the splitRatios shape that parseTuroCsv / computeSplitSharesCents
 * expects: Record<string, { lrBps: number; ownerBps: number }>.
 */
export function toSplitRatios(settings: FeeSettings): Record<string, { lrBps: number; ownerBps: number }> {
  const result: Record<string, { lrBps: number; ownerBps: number }> = {};
  for (const key of Object.keys(DEFAULT_OWNER_PCT) as SplitRatioKey[]) {
    const ownerBps = Math.round(resolvedOwnerPct(settings, key) * 100);
    result[key] = { ownerBps, lrBps: 10000 - ownerBps };
  }
  return result;
}
