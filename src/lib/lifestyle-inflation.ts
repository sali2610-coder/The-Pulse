// Lifestyle-inflation detector.
//
// Compares two rolling 3-month windows of net spend:
//   recent  = current month + 2 prior months
//   prior   = the same 3-month window 12 months ago
// Surfaces slow-burn habit drift that single-month yoy + month-
// over-month miss (one bad month doesn't move a rolling average).
//
// Pure compute. Slice-aware.

import type { ExpenseEntry, MonthKey } from "@/types/finance";
import { addMonths, monthKeyOf } from "@/lib/dates";
import { sliceForMonth } from "@/lib/projections";

export type LifestyleInflationReport = {
  recentWindow: MonthKey[]; // oldest first, length 3
  priorWindow: MonthKey[]; // same shape, 12 months earlier
  recentAvg: number; // average monthly spend in recent window
  priorAvg: number;
  delta: number; // recentAvg - priorAvg
  deltaPct: number; // signed; Infinity when priorAvg is 0
  /** Coarse bucket so the UI doesn't re-derive thresholds. */
  trend: "deflation" | "stable" | "drift" | "inflation";
};

function monthOutflow(args: {
  entries: ExpenseEntry[];
  monthKey: MonthKey;
}): number {
  let s = 0;
  for (const e of args.entries) {
    if (e.isRefund) continue;
    if (e.needsConfirmation) continue;
    if (e.bankPending) continue;
    if (e.excludeFromBudget) continue;
    if (e.currency && e.currency !== "ILS") continue;
    const slice = sliceForMonth(e, args.monthKey);
    if (!slice) continue;
    s += slice.amount;
  }
  return s;
}

function bucketTrend(args: {
  delta: number;
  deltaPct: number;
}): LifestyleInflationReport["trend"] {
  // Nothing happened in either window — calm.
  if (args.delta === 0) return "stable";
  if (!Number.isFinite(args.deltaPct)) {
    // priorAvg = 0 but recentAvg > 0 (or vice-versa). Direction
    // alone determines the bucket since the % is undefined.
    return args.delta > 0 ? "inflation" : "deflation";
  }
  const abs = Math.abs(args.deltaPct);
  if (args.deltaPct < 0 && abs >= 5) return "deflation";
  if (abs < 5) return "stable";
  if (args.deltaPct < 15) return "drift";
  return "inflation";
}

export function lifestyleInflationReport(args: {
  entries: ExpenseEntry[];
  endMonth?: MonthKey;
  now?: Date;
}): LifestyleInflationReport {
  const end = args.endMonth ?? monthKeyOf(args.now ?? new Date());
  const recentWindow: MonthKey[] = [
    addMonths(end, -2),
    addMonths(end, -1),
    end,
  ];
  const priorWindow: MonthKey[] = recentWindow.map((m) => addMonths(m, -12));

  const sumOf = (months: MonthKey[]) =>
    months.reduce(
      (acc, mk) => acc + monthOutflow({ entries: args.entries, monthKey: mk }),
      0,
    );
  const recentAvg = sumOf(recentWindow) / recentWindow.length;
  const priorAvg = sumOf(priorWindow) / priorWindow.length;
  const delta = recentAvg - priorAvg;
  const deltaPct =
    priorAvg === 0
      ? Number.POSITIVE_INFINITY
      : (delta / priorAvg) * 100;

  return {
    recentWindow,
    priorWindow,
    recentAvg,
    priorAvg,
    delta,
    deltaPct,
    trend: bucketTrend({ delta, deltaPct }),
  };
}
