// Budget recommendation engine.
//
// Given the user's historical monthly spend, propose a sensible
// `monthlyBudget` value. Used when the user hasn't set a budget at
// all, OR when their current budget materially diverges from what
// the data says. Pure compute — no mutation, no persistence.

import type { ExpenseEntry, MonthKey } from "@/types/finance";
import { addMonths } from "@/lib/dates";
import { sliceForMonth } from "@/lib/projections";

export type BudgetRecommendation = {
  /** Suggested monthlyBudget, rounded to nearest ₪100. */
  recommended: number;
  /** Number of complete prior months that fed the recommendation. */
  lookbackMonths: number;
  /** Arithmetic mean of monthly totals. */
  monthAvg: number;
  /** Median of monthly totals. */
  monthMedian: number;
  /** Coefficient of variation (stddev/mean) — 0 = stable, >0.3 noisy. */
  variability: number;
  /** Per-month totals (oldest → newest). */
  monthlyTotals: number[];
  /** True when at least 2 prior complete months are available. */
  hasEnoughData: boolean;
};

const FLOOR_ILS = 500;
const ROUND_TO = 100;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function roundToNearest(value: number, step: number): number {
  if (value <= 0) return 0;
  return Math.max(FLOOR_ILS, Math.round(value / step) * step);
}

function sumSpendForMonth(
  entries: ExpenseEntry[],
  monthKey: MonthKey,
): number {
  let total = 0;
  for (const entry of entries) {
    if (entry.isRefund) continue;
    if (entry.excludeFromBudget) continue;
    if (entry.needsConfirmation) continue;
    const slice = sliceForMonth(entry, monthKey);
    if (!slice) continue;
    total += slice.amount;
  }
  return total;
}

export function recommendBudget(args: {
  entries: ExpenseEntry[];
  monthKey: MonthKey;
  lookback?: number;
}): BudgetRecommendation {
  const lookback = args.lookback ?? 3;
  const monthlyTotals: number[] = [];
  for (let i = lookback; i >= 1; i--) {
    const mk = addMonths(args.monthKey, -i);
    const total = sumSpendForMonth(args.entries, mk);
    if (total > 0) monthlyTotals.push(total);
  }

  const hasEnoughData = monthlyTotals.length >= 2;
  if (monthlyTotals.length === 0) {
    return {
      recommended: 0,
      lookbackMonths: 0,
      monthAvg: 0,
      monthMedian: 0,
      variability: 0,
      monthlyTotals: [],
      hasEnoughData: false,
    };
  }

  const monthAvg =
    monthlyTotals.reduce((s, v) => s + v, 0) / monthlyTotals.length;
  const monthMedian = median(monthlyTotals);
  const variance =
    monthlyTotals.length > 1
      ? monthlyTotals.reduce((s, v) => s + (v - monthAvg) ** 2, 0) /
        monthlyTotals.length
      : 0;
  const stddev = Math.sqrt(variance);
  const variability = monthAvg > 0 ? stddev / monthAvg : 0;

  // High variability: pad the median by a small buffer (10%) to
  // reduce overshoot risk. Low variability: trust the median.
  const base = monthMedian;
  const padded = variability > 0.25 ? base * 1.1 : base;
  const recommended = roundToNearest(padded, ROUND_TO);

  return {
    recommended,
    lookbackMonths: monthlyTotals.length,
    monthAvg,
    monthMedian,
    variability,
    monthlyTotals,
    hasEnoughData,
  };
}
