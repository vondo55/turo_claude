import Papa from 'papaparse';
import { z } from 'zod';
import type { ParseResult, TuroTripRecord } from './types';

type RawRow = Record<string, string>;

type ColumnMap = {
  tripStart: string;
  tripEnd: string;
  grossRevenue: string;
  netEarnings?: string;
  addonsRevenue?: string;
  vehicleName?: string;
  status?: string;
  isCancelled?: string;
  splitItemColumns: Partial<Record<SplitItem, string>>;
};

const splitRatios = {
  'Trip price': { lrPct: 0.3, ownerPct: 0.7 },
  'Boost price': { lrPct: 0.3, ownerPct: 0.7 },
  'Cancellation fee': { lrPct: 0.3, ownerPct: 0.7 },
  'Additional usage': { lrPct: 0.3, ownerPct: 0.7 },
  'Excess distance': { lrPct: 0.0, ownerPct: 1.0 },
  Smoking: { lrPct: 0.9, ownerPct: 0.1 },
  Delivery: { lrPct: 0.9, ownerPct: 0.1 },
  Extras: { lrPct: 1.0, ownerPct: 0.0 },
  'Gas reimbursement': { lrPct: 1.0, ownerPct: 0.0 },
  Cleaning: { lrPct: 1.0, ownerPct: 0.0 },
  'Late fee': { lrPct: 1.0, ownerPct: 0.0 },
  'Improper return fee': { lrPct: 1.0, ownerPct: 0.0 },
  '3-day discount': { lrPct: 0.3, ownerPct: 0.7 },
  '1-week discount': { lrPct: 0.3, ownerPct: 0.7 },
  '2-week discount': { lrPct: 0.3, ownerPct: 0.7 },
  '1-month discount': { lrPct: 0.3, ownerPct: 0.7 },
  '2-month discount': { lrPct: 0.3, ownerPct: 0.7 },
  '3-month discount': { lrPct: 0.3, ownerPct: 0.7 },
  'Early bird discount': { lrPct: 0.3, ownerPct: 0.7 },
  'Host promotional credit': { lrPct: 0.3, ownerPct: 0.7 },
  'On-trip EV charging': { lrPct: 1.0, ownerPct: 0.0 },
  'Post-trip EV charging': { lrPct: 1.0, ownerPct: 0.0 },
  'Tolls & tickets': { lrPct: 1.0, ownerPct: 0.0 },
  'Other fees': { lrPct: 1.0, ownerPct: 0.0 },
} as const;

type SplitItem = keyof typeof splitRatios;

const recordSchema = z.object({
  rowNumber: z.number().int().positive(),
  tripStart: z.date(),
  tripEnd: z.date(),
  vehicleName: z.string(),
  grossRevenue: z.number().finite(),
  netEarnings: z.number().finite().nullable(),
  addonsRevenue: z.number().finite().nullable(),
  lrShare: z.number().finite(),
  ownerShare: z.number().finite(),
  isCancelled: z.boolean(),
  status: z.string().nullable(),
});

const aliases = {
  tripStart: ['tripstart', 'startdate', 'pickupdate', 'tripstartdate', 'reservationstart'],
  tripEnd: ['tripend', 'enddate', 'dropoffdate', 'tripenddate', 'reservationend'],
  grossRevenue: ['tripprice', 'grossrevenue', 'triptotal', 'revenue', 'gross'],
  netEarnings: ['totalearnings', 'netearnings', 'hostearnings', 'netpayout', 'earnings'],
  addonsRevenue: ['addonrevenue', 'extras', 'additionalincome', 'addons'],
  vehicleName: ['vehiclename', 'vehicle', 'car', 'listingtitle'],
  status: ['tripstatus', 'status', 'reservationstatus'],
  isCancelled: ['cancelled', 'iscancelled', 'canceled', 'iscanceled'],
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findColumn(headers: string[], matchers: string[]): string | undefined {
  const normalized = new Map(headers.map((h) => [normalizeHeader(h), h]));
  for (const matcher of matchers) {
    const found = normalized.get(matcher);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function buildColumnMap(headers: string[]): ColumnMap {
  const tripStart = findColumn(headers, aliases.tripStart);
  const tripEnd = findColumn(headers, aliases.tripEnd);
  const grossRevenue = findColumn(headers, aliases.grossRevenue);

  if (!tripStart || !tripEnd || !grossRevenue) {
    const missing = [
      !tripStart ? 'Trip start date' : null,
      !tripEnd ? 'Trip end date' : null,
      !grossRevenue ? 'Gross revenue' : null,
    ].filter(Boolean);

    throw new Error(`Missing required column(s): ${missing.join(', ')}.`);
  }

  return {
    tripStart,
    tripEnd,
    grossRevenue,
    netEarnings: findColumn(headers, aliases.netEarnings),
    addonsRevenue: findColumn(headers, aliases.addonsRevenue),
    vehicleName: findColumn(headers, aliases.vehicleName),
    status: findColumn(headers, aliases.status),
    isCancelled: findColumn(headers, aliases.isCancelled),
    splitItemColumns: buildSplitItemColumns(headers),
  };
}

function buildSplitItemColumns(headers: string[]): Partial<Record<SplitItem, string>> {
  const columns: Partial<Record<SplitItem, string>> = {};
  for (const item of Object.keys(splitRatios) as SplitItem[]) {
    const found = findColumn(headers, [normalizeHeader(item)]);
    if (found) {
      columns[item] = found;
    }
  }
  return columns;
}

function parseDate(value: string): Date | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function parseMoney(value: string | undefined): number | null {
  if (!value) return null;

  const cleaned = value
    .trim()
    .replace(/[$,\s]/g, '')
    .replace(/^\((.*)\)$/, '-$1');
  if (cleaned === '' || cleaned === '-') return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function parseCancelled(raw: RawRow, map: ColumnMap): boolean {
  if (map.isCancelled) {
    const value = String(raw[map.isCancelled] ?? '').toLowerCase();
    if (['true', 'yes', '1'].includes(value)) return true;
    if (['false', 'no', '0'].includes(value)) return false;
  }

  const status = map.status ? String(raw[map.status] ?? '').toLowerCase() : '';
  return status.includes('cancel');
}

function parseRow(raw: RawRow, rowNumber: number, map: ColumnMap): TuroTripRecord {
  const start = parseDate(raw[map.tripStart]);
  const end = parseDate(raw[map.tripEnd]);
  const gross = parseMoney(raw[map.grossRevenue]);

  if (!start || !end || gross === null) {
    throw new Error(`Row ${rowNumber}: invalid date or revenue format.`);
  }

  let lrShare = 0;
  let ownerShare = 0;
  for (const item of Object.keys(splitRatios) as SplitItem[]) {
    const columnName = map.splitItemColumns[item];
    const amount = parseMoney(columnName ? raw[columnName] : undefined) ?? 0;
    lrShare += amount * splitRatios[item].lrPct;
    ownerShare += amount * splitRatios[item].ownerPct;
  }

  const candidate: TuroTripRecord = {
    rowNumber,
    tripStart: start,
    tripEnd: end,
    vehicleName: map.vehicleName ? String(raw[map.vehicleName] ?? '').trim() || 'Unknown vehicle' : 'Unknown vehicle',
    grossRevenue: gross,
    netEarnings: map.netEarnings ? parseMoney(raw[map.netEarnings]) : null,
    addonsRevenue: map.addonsRevenue ? parseMoney(raw[map.addonsRevenue]) : null,
    lrShare: Number(lrShare.toFixed(2)),
    ownerShare: Number(ownerShare.toFixed(2)),
    isCancelled: parseCancelled(raw, map),
    status: map.status ? String(raw[map.status] ?? '').trim() || null : null,
  };

  return recordSchema.parse(candidate);
}

export async function parseTuroCsv(file: File): Promise<ParseResult> {
  const parsed = await new Promise<Papa.ParseResult<RawRow>>((resolve, reject) => {
    Papa.parse<RawRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: resolve,
      error: reject,
    });
  });

  if (!parsed.meta.fields || parsed.meta.fields.length === 0) {
    throw new Error('CSV appears empty or missing a header row.');
  }

  const map = buildColumnMap(parsed.meta.fields);
  const warnings: string[] = [];
  const records: TuroTripRecord[] = [];

  parsed.data.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    try {
      records.push(parseRow(raw, rowNumber, map));
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : `Row ${rowNumber}: skipped due to parse error.`);
    }
  });

  if (records.length === 0) {
    throw new Error('No valid rows found after parsing.');
  }

  return { records, warnings };
}
