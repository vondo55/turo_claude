import type { DashboardData } from './types';

export type CopilotActionType = 'export_csv' | 'export_pdf';

export type CopilotAction = {
  type: CopilotActionType;
  label: string;
};

export type CopilotMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  citations?: string[];
  actions?: CopilotAction[];
};

export type CopilotContext = {
  mode: 'ops' | 'accounting';
  dataSource: 'currentUpload' | 'supabaseHistory';
  filters: {
    month: string;
    owners: string[];
    vehicles: string[];
  };
  metrics: {
    totalTrips: number;
    totalBookings: number;
    grossRevenue: number;
    totalEarnings: number;
    lrShare: number;
    ownerShare: number;
    cancellationRate: number;
  };
  monthlyRevenue: Array<{ label: string; revenue: number }>;
  topVehicles: Array<{
    ownerName: string;
    vehicle: string;
    bookings: number;
    totalEarnings: number;
    lrShare: number;
    ownerShare: number;
  }>;
};

function fmtCurrency(value: number): string {
  return value.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function includesAny(question: string, terms: string[]): boolean {
  return terms.some((term) => question.includes(term));
}

export function hasMutationIntent(question: string): boolean {
  const lowered = question.toLowerCase();
  return includesAny(lowered, [
    'update',
    'delete',
    'remove',
    'insert',
    'write',
    'save to database',
    'commit this',
    'change row',
    'apply change',
    'sync this',
  ]);
}

export function buildCopilotContext(params: {
  data: DashboardData;
  dataSource: 'currentUpload' | 'supabaseHistory';
  mode: 'ops' | 'accounting';
  selectedMonth: string;
  selectedOwners: string[];
  selectedVehicles: string[];
  revenueSeries: Array<{ label: string; revenue: number }>;
}): CopilotContext {
  const { data, dataSource, mode, selectedMonth, selectedOwners, selectedVehicles, revenueSeries } = params;

  return {
    mode,
    dataSource,
    filters: {
      month: selectedMonth,
      owners: selectedOwners,
      vehicles: selectedVehicles,
    },
    metrics: {
      totalTrips: data.metrics.totalTrips,
      totalBookings: data.metrics.totalBookings,
      grossRevenue: data.metrics.grossRevenue,
      totalEarnings: data.metrics.totalEarnings,
      lrShare: data.metrics.lrShare,
      ownerShare: data.metrics.ownerShare,
      cancellationRate: data.metrics.cancellationRate,
    },
    monthlyRevenue: revenueSeries.slice(-12),
    topVehicles: data.vehicleBreakdown
      .slice()
      .sort((a, b) => b.totalEarnings - a.totalEarnings)
      .slice(0, 20)
      .map((row) => ({
        ownerName: row.ownerName,
        vehicle: row.vehicle,
        bookings: row.totalBookings,
        totalEarnings: row.totalEarnings,
        lrShare: row.lrShare,
        ownerShare: row.ownerShare,
      })),
  };
}

export function answerWithLocalCopilot(question: string, context: CopilotContext): Omit<CopilotMessage, 'id' | 'role'> {
  const lowered = question.toLowerCase();

  if (hasMutationIntent(lowered)) {
    return {
      text: 'Copilot is in read-only mode. I can summarize data and generate exports, but I cannot write or modify backend records.',
      citations: ['guardrails'],
    };
  }

  const lrPct = context.metrics.totalEarnings > 0 ? (context.metrics.lrShare / context.metrics.totalEarnings) * 100 : 0;
  const ownerPct = context.metrics.totalEarnings > 0 ? (context.metrics.ownerShare / context.metrics.totalEarnings) * 100 : 0;
  const gap = context.metrics.totalEarnings - (context.metrics.lrShare + context.metrics.ownerShare);
  const topVehicle = context.topVehicles[0];

  if (includesAny(lowered, ['summarize', 'summary', 'overview'])) {
    return {
      text: [
        `Current view summary: ${context.metrics.totalBookings.toLocaleString()} bookings, ${fmtCurrency(context.metrics.totalEarnings)} total earnings, ${fmtCurrency(context.metrics.lrShare)} LR share (${fmtPct(lrPct)}), and ${fmtCurrency(context.metrics.ownerShare)} owner share (${fmtPct(ownerPct)}).`,
        `Reconciliation gap is ${fmtCurrency(gap)}.`,
        topVehicle
          ? `Top vehicle by earnings is ${topVehicle.vehicle} (${topVehicle.ownerName}) at ${fmtCurrency(topVehicle.totalEarnings)}.`
          : 'No vehicle rows are available in the current view.',
      ].join(' '),
      citations: ['metrics', 'owner_economics_table'],
      actions: [
        { type: 'export_csv', label: 'Export CSV' },
        { type: 'export_pdf', label: 'Export PDF' },
      ],
    };
  }

  if (includesAny(lowered, ['lr share', 'owner share', 'split', 'reconciliation'])) {
    return {
      text: `LR share is ${fmtCurrency(context.metrics.lrShare)} (${fmtPct(lrPct)}), owner share is ${fmtCurrency(context.metrics.ownerShare)} (${fmtPct(ownerPct)}), and the reconciliation gap is ${fmtCurrency(gap)} for the current filter context.`,
      citations: ['metrics', 'owner_economics_table'],
    };
  }

  if (includesAny(lowered, ['top vehicle', 'best vehicle', 'vehicle'])) {
    if (!topVehicle) {
      return {
        text: 'No vehicle data is available for the current filters. Try broadening month/owner/vehicle filters.',
        citations: ['owner_economics_table'],
      };
    }

    return {
      text: `Top vehicle by total earnings is ${topVehicle.vehicle} (${topVehicle.ownerName}): ${fmtCurrency(topVehicle.totalEarnings)} across ${topVehicle.bookings} bookings. LR share ${fmtCurrency(topVehicle.lrShare)}, owner share ${fmtCurrency(topVehicle.ownerShare)}.`,
      citations: ['owner_economics_table'],
    };
  }

  if (includesAny(lowered, ['trend', 'month', 'revenue trend'])) {
    const latestPoints = context.monthlyRevenue.slice(-3);
    if (latestPoints.length === 0) {
      return {
        text: 'No monthly revenue trend points are available for this current view.',
        citations: ['monthly_revenue'],
      };
    }

    const trendText = latestPoints.map((point) => `${point.label}: ${fmtCurrency(point.revenue)}`).join(', ');
    return {
      text: `Recent revenue points in this view are ${trendText}.`,
      citations: ['monthly_revenue'],
    };
  }

  if (includesAny(lowered, ['export', 'print', 'pdf', 'csv'])) {
    return {
      text: 'I can export the current filtered view as CSV or PDF now. Choose one below.',
      citations: ['current_filters', 'owner_economics_table'],
      actions: [
        { type: 'export_csv', label: 'Export CSV' },
        { type: 'export_pdf', label: 'Export PDF' },
      ],
    };
  }

  return {
    text: 'I can help with summaries, LR/Owner split checks, vehicle-level performance, revenue trend questions, and CSV/PDF export for the current filtered view.',
    citations: ['metrics', 'owner_economics_table', 'monthly_revenue'],
    actions: [
      { type: 'export_csv', label: 'Export CSV' },
      { type: 'export_pdf', label: 'Export PDF' },
    ],
  };
}
