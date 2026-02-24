import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTuroCsv } from '../src/lib/csv';
import { buildDashboardData } from '../src/lib/metrics';

const fixturePath = resolve(process.cwd(), 'tests/fixtures/trip_earnings_fixture.csv');

async function parseFixture() {
  const csvText = readFileSync(fixturePath, 'utf-8');
  const file = new File([csvText], 'trip_earnings_fixture.csv', { type: 'text/csv' });
  return parseTuroCsv(file);
}

describe('parser and metrics', () => {
  it('parses fixture and captures mixed statuses for completed-only filtering', async () => {
    const parsed = await parseFixture();
    expect(parsed.records.length).toBe(10);

    const completed = parsed.records.filter((record) => (record.status ?? '').toLowerCase() === 'completed');
    const cancelled = parsed.records.filter((record) => (record.status ?? '').toLowerCase().includes('cancel'));

    expect(completed.length).toBe(8);
    expect(cancelled.length).toBe(2);
  });

  it('throws a clear error when required revenue column is missing', async () => {
    const invalidCsv = [
      'Trip start,Trip end,Vehicle name,Trip status,Total earnings',
      '2025-01-01 10:00 AM,2025-01-02 11:00 AM,Toyota Sienna 2024,Completed,$100.00',
    ].join('\n');

    const file = new File([invalidCsv], 'missing_gross.csv', { type: 'text/csv' });
    await expect(parseTuroCsv(file)).rejects.toThrow('Missing required column(s): Gross revenue.');
  });

  it('reconciles LR + Owner share to total earnings for completed rows', async () => {
    const parsed = await parseFixture();
    const completed = parsed.records.filter((record) => (record.status ?? '').toLowerCase() === 'completed');
    const dashboard = buildDashboardData(completed);

    const gap = dashboard.metrics.totalEarnings - (dashboard.metrics.lrShare + dashboard.metrics.ownerShare);
    expect(Math.abs(gap)).toBeLessThan(0.01);
  });

  it('groups monthly revenue by trip end month, not trip start month', async () => {
    const parsed = await parseFixture();
    const completed = parsed.records.filter((record) => (record.status ?? '').toLowerCase() === 'completed');
    const dashboard = buildDashboardData(completed);

    const expectedByLabel = new Map<string, number>();
    for (const record of completed) {
      const key = new Date(record.tripEnd.getFullYear(), record.tripEnd.getMonth(), 1).toLocaleDateString(undefined, {
        month: 'short',
        year: 'numeric',
      });
      expectedByLabel.set(key, Number(((expectedByLabel.get(key) ?? 0) + record.grossRevenue).toFixed(2)));
    }

    const actualByLabel = new Map(dashboard.monthlyRevenue.map((entry) => [entry.month, entry.revenue]));
    expect(actualByLabel).toEqual(expectedByLabel);
  });

  it('keeps monthly utilization within sane bounds', async () => {
    const parsed = await parseFixture();
    const completed = parsed.records.filter((record) => (record.status ?? '').toLowerCase() === 'completed');
    const dashboard = buildDashboardData(completed);

    expect(dashboard.monthlyUtilization.length).toBeGreaterThan(0);
    for (const row of dashboard.monthlyUtilization) {
      expect(row.utilizationPct).toBeGreaterThanOrEqual(0);
      expect(row.utilizationPct).toBeLessThanOrEqual(100);
    }
  });
});
