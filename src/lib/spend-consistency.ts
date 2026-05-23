// Spend consistency score.
//
// Measures how evenly the user's spending is distributed across
// the days of the month. Low std-dev relative to mean ("CV" —
// coefficient of variation) means predictable spending — the
// kind a daily-allowance budget can rely on. High CV means
// burst-y spending (a 3000₪ Friday wipes the week).
//
// Pure compute. Reuses sliceForMonth so installments contribute
// at their per-month slice. Days with zero spend ARE included in
// the daily series so a quiet week brings the mean (and CV) down.

import type { ExpenseEntry, MonthKey } from "@/types/finance";
import { monthKeyOf } from "@/lib/dates";
import { daysInMonth, sliceForMonth } from "@/lib/projections";

export type ConsistencyRating = "even" | "steady" | "uneven" | "burst";

export type SpendConsistency = {
  monthKey: MonthKey;
  daysInWindow: number;
  /** Average daily spend across the WINDOW (not just spending days). */
  mean: number;
  /** Population std-dev of the daily series. */
  stdDev: number;
  /** stdDev ÷ mean. 0 = flat, ≥1 = highly burst-y. Infinity when
   *  mean is 0. */
  cv: number;
  /** Highest single-day spend in the window. */
  maxDay: number;
  /** Number of days with at least one charge. */
  spendingDays: number;
  rating: ConsistencyRating;
};

function rate(cv: number): ConsistencyRating {
  if (!Number.isFinite(cv)) return "even";
  if (cv < 0.5) return "even";
  if (cv < 1) return "steady";
  if (cv < 1.5) return "uneven";
  return "burst";
}

export function spendConsistency(args: {
  entries: ExpenseEntry[];
  monthKey?: MonthKey;
  /** When provided, only the first N days of the month are
   *  considered (useful for "consistency so far this month").
   *  Defaults to the full month. */
  uptoDay?: number;
  now?: Date;
}): SpendConsistency {
  const monthKey = args.monthKey ?? monthKeyOf(args.now ?? new Date());
  const last = daysInMonth(monthKey);
  const window = Math.max(1, Math.min(last, args.uptoDay ?? last));

  const daily: number[] = Array.from({ length: window }, () => 0);
  for (const e of args.entries) {
    if (e.isRefund) continue;
    if (e.needsConfirmation) continue;
    if (e.bankPending) continue;
    if (e.excludeFromBudget) continue;
    if (e.currency && e.currency !== "ILS") continue;
    const slice = sliceForMonth(e, monthKey);
    if (!slice) continue;
    const d = slice.chargeDate.getDate(); // 1..31
    if (d < 1 || d > window) continue;
    daily[d - 1] += slice.amount;
  }

  const total = daily.reduce((a, b) => a + b, 0);
  const mean = total / window;
  const variance =
    window > 0
      ? daily.reduce((a, v) => a + (v - mean) * (v - mean), 0) / window
      : 0;
  const stdDev = Math.sqrt(variance);
  const cv = mean > 0 ? stdDev / mean : Number.POSITIVE_INFINITY;
  const maxDay = daily.reduce((m, v) => (v > m ? v : m), 0);
  const spendingDays = daily.reduce((n, v) => (v > 0 ? n + 1 : n), 0);

  return {
    monthKey,
    daysInWindow: window,
    mean,
    stdDev,
    cv,
    maxDay,
    spendingDays,
    rating: mean === 0 ? "even" : rate(cv),
  };
}
