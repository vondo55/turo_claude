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
};

const recordSchema = z.object({
  rowNumber: z.number().int().positive(),
  tripStart: z.date(),
  tripEnd: z.date(),
  vehicleName: z.string(),
  grossRevenue: z.number().finite(),
  netEarnings: z.number().finite().nullable(),
  addonsRevenue: z.number().finite().nullable(),
  isCancelled: z.boolean(),
  status: z.string().nullable(),
});

const aliases = {
  tripStart: ['tripstart', 'startdate', 'pickupdate', 'tripstartdate', 'reservationstart'],
  tripEnd: ['tripend', 'enddate', 'dropoffdate', 'tripenddate', 'reservationend'],
  grossRevenue: ['grossrevenue', 'tripprice', 'triptotal', 'totalearnings', 'revenue', 'gross'],
  netEarnings: ['netearnings', 'hostearnings', 'netpayout', 'earnings'],
  addonsRevenue: ['addonrevenue', 'extras', 'additionalincome', 'addons'],
  vehicleName: ['vehicle', 'car', 'vehiclename', 'listingtitle'],
  status: ['status', 'tripstatus', 'reservationstatus'],
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
  };
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

  const cleaned = value.replace(/[$,\s]/g, '').replace(/\((.*)\)/, '-$1');
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

  const candidate: TuroTripRecord = {
    rowNumber,
    tripStart: start,
    tripEnd: end,
    vehicleName: map.vehicleName ? String(raw[map.vehicleName] ?? '').trim() || 'Unknown vehicle' : 'Unknown vehicle',
    grossRevenue: gross,
    netEarnings: map.netEarnings ? parseMoney(raw[map.netEarnings]) : null,
    addonsRevenue: map.addonsRevenue ? parseMoney(raw[map.addonsRevenue]) : null,
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
