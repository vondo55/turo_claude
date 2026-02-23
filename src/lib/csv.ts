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
  vehicleRaw?: string;
  ownerName?: string;
  ownerFirstName?: string;
  ownerLastName?: string;
  status?: string;
  isCancelled?: string;
  splitItemColumns: Partial<Record<SplitItem, string>>;
};

// Allocation policy: see docs/decisions/0001-line-item-allocation.md
const splitRatios = {
  'Trip price': { lrBps: 3000, ownerBps: 7000 },
  'Boost price': { lrBps: 3000, ownerBps: 7000 },
  '3-day discount': { lrBps: 3000, ownerBps: 7000 },
  '1-week discount': { lrBps: 3000, ownerBps: 7000 },
  '2-week discount': { lrBps: 3000, ownerBps: 7000 },
  '3-week discount': { lrBps: 3000, ownerBps: 7000 },
  '1-month discount': { lrBps: 3000, ownerBps: 7000 },
  '2-month discount': { lrBps: 3000, ownerBps: 7000 },
  '3-month discount': { lrBps: 3000, ownerBps: 7000 },
  'Non-refundable discount': { lrBps: 3000, ownerBps: 7000 },
  'Early bird discount': { lrBps: 3000, ownerBps: 7000 },
  'Host promotional credit': { lrBps: 3000, ownerBps: 7000 },
  'Cancellation fee': { lrBps: 3000, ownerBps: 7000 },
  'Additional usage': { lrBps: 3000, ownerBps: 7000 },
  'Excess distance': { lrBps: 0, ownerBps: 10000 },
  Smoking: { lrBps: 9000, ownerBps: 1000 },
  Delivery: { lrBps: 9000, ownerBps: 1000 },
  Extras: { lrBps: 10000, ownerBps: 0 },
  'Gas reimbursement': { lrBps: 10000, ownerBps: 0 },
  Cleaning: { lrBps: 10000, ownerBps: 0 },
  'Late fee': { lrBps: 10000, ownerBps: 0 },
  'Improper return fee': { lrBps: 10000, ownerBps: 0 },
  'Airport operations fee': { lrBps: 10000, ownerBps: 0 },
  'Airport parking credit': { lrBps: 10000, ownerBps: 0 },
  'On-trip EV charging': { lrBps: 10000, ownerBps: 0 },
  'Post-trip EV charging': { lrBps: 10000, ownerBps: 0 },
  'Tolls & tickets': { lrBps: 10000, ownerBps: 0 },
  'Fines (paid to host)': { lrBps: 0, ownerBps: 10000 },
  'Other fees': { lrBps: 10000, ownerBps: 0 },
  'Gas fee': { lrBps: 10000, ownerBps: 0 },
  'Sales tax': { lrBps: 10000, ownerBps: 0 },
} as const;

type SplitItem = keyof typeof splitRatios;

const recordSchema = z.object({
  rowNumber: z.number().int().positive(),
  tripStart: z.date(),
  tripEnd: z.date(),
  vehicleName: z.string(),
  ownerName: z.string(),
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
  vehicleName: ['vehiclename', 'car'],
  vehicleRaw: ['vehicle', 'listingtitle'],
  ownerName: [
    'owner',
    'ownername',
    'vehicleowner',
    'carowner',
    'host',
    'hostname',
    'hostfullname',
    'hostname',
    'primaryowner',
  ],
  ownerFirstName: ['ownerfirstname', 'hostfirstname', 'firstname'],
  ownerLastName: ['ownerlastname', 'hostlastname', 'lastname'],
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
    vehicleRaw: findColumn(headers, aliases.vehicleRaw),
    ownerName: findColumn(headers, aliases.ownerName),
    ownerFirstName: findColumn(headers, aliases.ownerFirstName),
    ownerLastName: findColumn(headers, aliases.ownerLastName),
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
  const cents = parseMoneyCents(value);
  return cents === null ? null : cents / 100;
}

function parseMoneyCents(value: string | undefined): number | null {
  if (!value) return null;

  const cleaned = value
    .trim()
    .replace(/[$,\s]/g, '')
    .replace(/^\((.*)\)$/, '-$1');
  if (cleaned === '' || cleaned === '-') return null;
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const number = Number(cleaned);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100);
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

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeVehicleKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function cleanOwnerPrefix(prefix: string): string | null {
  const cleaned = prefix.trim().replace(/[-|:,]+$/, '').trim();
  if (!cleaned) return null;
  return cleaned.endsWith("'s") ? cleaned.slice(0, -2).trim() : cleaned;
}

function extractOwnerName(vehicleName: string): string {
  const trimmed = vehicleName.trim();
  if (!trimmed) return 'Unknown owner';

  const possessiveIndex = trimmed.indexOf("'s ");
  if (possessiveIndex > 0) {
    return trimmed.slice(0, possessiveIndex).trim() || 'Unknown owner';
  }

  // Accept "First I. Vehicle..." pattern when present in some exports.
  const initialPattern = trimmed.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+[A-Z]\.)\s+/);
  if (initialPattern?.[1]) {
    return initialPattern[1].trim();
  }

  // Fallback: split on first vehicle make token (e.g., "Ehsan Shirazi Toyota Sienna ...").
  const makePattern =
    /\b(Toyota|Tesla|Chevrolet|BMW|Mercedes(?:-Benz)?|Audi|Volkswagen|VW|Nissan|Mitsubishi|MINI|Kia|Hyundai|Ford|Honda|Subaru|Mazda|Lexus|Acura|Jeep|Ram|Porsche|Volvo|GMC|Cadillac|Buick|Chrysler|Dodge|Lincoln|Infiniti|Genesis|Land Rover)\b/i;
  const makeMatch = trimmed.match(makePattern);
  if (makeMatch?.index && makeMatch.index > 0) {
    const prefix = trimmed.slice(0, makeMatch.index).trim().replace(/[-|:,]+$/, '').trim();
    if (prefix.length > 0) {
      return prefix;
    }
  }

  return 'Unknown owner';
}

function extractOwnerFromVehicleColumns(rawVehicle: string, cleanVehicle: string): string | null {
  const raw = rawVehicle.trim();
  const clean = cleanVehicle.trim();
  if (!raw || !clean) return null;

  const rawLower = raw.toLowerCase();
  const cleanLower = clean.toLowerCase();
  const idx = rawLower.indexOf(cleanLower);
  if (idx > 0) {
    return cleanOwnerPrefix(raw.slice(0, idx));
  }

  // Fuzzy tokenized match for cases like "GLB-Class" vs "GLB Class".
  const rawWords = raw
    .split(/\s+/)
    .map((word) => ({ raw: word, norm: normalizeToken(word) }))
    .filter((word) => word.norm.length > 0);
  const cleanWords = clean
    .split(/\s+/)
    .map((word) => ({ norm: normalizeToken(word) }))
    .filter((word) => word.norm.length > 0);

  if (rawWords.length === 0 || cleanWords.length === 0) return null;

  const maxMatchDepth = Math.min(cleanWords.length, 4);
  const matchesToken = (a: string, b: string) => a === b || a.startsWith(b) || b.startsWith(a);

  for (let startIdx = 0; startIdx < rawWords.length; startIdx += 1) {
    if (!matchesToken(rawWords[startIdx].norm, cleanWords[0].norm)) continue;
    let matched = 1;
    while (
      matched < maxMatchDepth &&
      startIdx + matched < rawWords.length &&
      matchesToken(rawWords[startIdx + matched].norm, cleanWords[matched].norm)
    ) {
      matched += 1;
    }
    if (matched >= Math.min(2, cleanWords.length) && startIdx > 0) {
      const ownerPrefix = rawWords
        .slice(0, startIdx)
        .map((word) => word.raw)
        .join(' ');
      return cleanOwnerPrefix(ownerPrefix);
    }
  }

  return null;
}

function parseRow(raw: RawRow, rowNumber: number, map: ColumnMap): TuroTripRecord {
  const start = parseDate(raw[map.tripStart]);
  const end = parseDate(raw[map.tripEnd]);
  const gross = parseMoney(raw[map.grossRevenue]);

  if (!start || !end || gross === null) {
    throw new Error(`Row ${rowNumber}: invalid date or revenue format.`);
  }

  let lrShareCents = 0;
  let ownerShareCents = 0;
  for (const item of Object.keys(splitRatios) as SplitItem[]) {
    const columnName = map.splitItemColumns[item];
    const amountCents = parseMoneyCents(columnName ? raw[columnName] : undefined) ?? 0;
    const lrPartCents = Math.round((amountCents * splitRatios[item].lrBps) / 10000);
    const ownerPartCents = amountCents - lrPartCents;
    lrShareCents += lrPartCents;
    ownerShareCents += ownerPartCents;
  }

  const cleanVehicleName = map.vehicleName ? String(raw[map.vehicleName] ?? '').trim() : '';
  const rawVehicleName = map.vehicleRaw ? String(raw[map.vehicleRaw] ?? '').trim() : '';
  const vehicleName = cleanVehicleName || rawVehicleName || 'Unknown vehicle';
  if (vehicleName === 'Unknown vehicle') {
    throw new Error(`Row ${rowNumber}: missing vehicle name.`);
  }
  const ownerFromColumn = map.ownerName ? String(raw[map.ownerName] ?? '').trim() : '';
  const ownerFirst = map.ownerFirstName ? String(raw[map.ownerFirstName] ?? '').trim() : '';
  const ownerLast = map.ownerLastName ? String(raw[map.ownerLastName] ?? '').trim() : '';
  const ownerFromParts = [ownerFirst, ownerLast].filter(Boolean).join(' ').trim();
  const ownerFromVehicleColumns =
    cleanVehicleName && rawVehicleName ? extractOwnerFromVehicleColumns(rawVehicleName, cleanVehicleName) : null;
  const ownerName = ownerFromColumn || ownerFromParts || ownerFromVehicleColumns || extractOwnerName(vehicleName);

  const candidate: TuroTripRecord = {
    rowNumber,
    tripStart: start,
    tripEnd: end,
    vehicleName,
    ownerName,
    grossRevenue: gross,
    netEarnings: map.netEarnings ? parseMoney(raw[map.netEarnings]) : null,
    addonsRevenue: map.addonsRevenue ? parseMoney(raw[map.addonsRevenue]) : null,
    lrShare: lrShareCents / 100,
    ownerShare: ownerShareCents / 100,
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

  const normalizedRecords = backfillOwnersFromKnownVehicles(records);
  for (const record of normalizedRecords) {
    if (record.ownerName === 'Unknown owner') {
      warnings.push(`Row ${record.rowNumber}: could not determine owner for vehicle "${record.vehicleName}".`);
    }
  }
  return { records: normalizedRecords, warnings };
}

function backfillOwnersFromKnownVehicles(records: TuroTripRecord[]): TuroTripRecord[] {
  const ownerCountsByVehicle = new Map<string, Map<string, number>>();

  for (const record of records) {
    if (record.ownerName === 'Unknown owner') continue;
    const vehicleKey = normalizeVehicleKey(record.vehicleName);
    if (!vehicleKey) continue;
    const currentOwners = ownerCountsByVehicle.get(vehicleKey) ?? new Map<string, number>();
    currentOwners.set(record.ownerName, (currentOwners.get(record.ownerName) ?? 0) + 1);
    ownerCountsByVehicle.set(vehicleKey, currentOwners);
  }

  const preferredOwnerByVehicle = new Map<string, string>();
  for (const [vehicleKey, ownerCounts] of ownerCountsByVehicle.entries()) {
    const preferred = Array.from(ownerCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (preferred) {
      preferredOwnerByVehicle.set(vehicleKey, preferred);
    }
  }

  return records.map((record) => {
    if (record.ownerName !== 'Unknown owner') return record;
    const inferredOwner = preferredOwnerByVehicle.get(normalizeVehicleKey(record.vehicleName));
    return inferredOwner ? { ...record, ownerName: inferredOwner } : record;
  });
}
