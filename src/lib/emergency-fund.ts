// Emergency-fund estimator.
//
// Derives a recommended emergency-fund target from the user's
// recent average monthly outflow and reports how far the
// current liquid cushion (Σ active bank anchorBalance, positives
// only) gets toward it.
//
// Pure compute. Reuses the same noise filters the rest of the
// budget math uses so the baseline matches the dashboard.

import type {
  Account,
  ExpenseEntry,
  MonthKey,
} from "@/types/finance";
import { addMonths, monthKeyOf } from "@/lib/dates";
import { sliceForMonth } from "@/lib/projections";

export type EmergencyFundReport = {
  /** Target months of expenses to cover. */
  targetMonths: number;
  /** Average monthly outflow used as the baseline. */
  baselineMonthly: number;
  /** Recommended fund = baselineMonthly × targetMonths. */
  targetAmount: number;
  /** Current liquid assets (positive bank anchors only — overdraft
   *  banks excluded). */
  currentLiquid: number;
  /** currentLiquid / targetAmount, clamped to [0, 1]. */
  progress: number;
  /** Estimated months the current liquid would last at the
   *  baseline rate. Infinity when baselineMonthly is 0. */
  monthsCovered: number;
  /** Coarse rating bucket so the UI can pick a tone without
   *  re-implementing the math. */
  rating: "none" | "low" | "watch" | "ok" | "excellent";
};

function monthOutflow(args: {
  entries: ExpenseEntry[];
  monthKey: MonthKey;
}): number {
  let sum = 0;
  for (const e of args.entries) {
    if (e.isRefund) continue;
    if (e.needsConfirmation) continue;
    if (e.bankPending) continue;
    if (e.excludeFromBudget) continue;
    if (e.currency && e.currency !== "ILS") continue;
    const slice = sliceForMonth(e, args.monthKey);
    if (!slice) continue;
    sum += slice.amount;
  }
  return sum;
}

function rate(progress: number): EmergencyFundReport["rating"] {
  if (progress <= 0) return "none";
  if (progress < 0.33) return "low";
  if (progress < 0.66) return "watch";
  if (progress < 1) return "ok";
  return "excellent";
}

export function emergencyFundReport(args: {
  accounts: Account[];
  entries: ExpenseEntry[];
  /** Months over which to average outflow. Default 3. */
  lookback?: number;
  /** Months of cushion to target. Default 3 (industry baseline). */
  targetMonths?: number;
  /** Anchor used as "now" for windowing. Default current date. */
  now?: Date;
}): EmergencyFundReport {
  const now = args.now ?? new Date();
  const lookback = Math.max(1, args.lookback ?? 3);
  const targetMonths = Math.max(1, args.targetMonths ?? 3);

  // Baseline = average outflow over the prior `lookback` COMPLETED
  // months (excludes the current month so an early-in-the-month
  // call doesn't drag the baseline down).
  const currentMonth = monthKeyOf(now);
  let total = 0;
  for (let i = 1; i <= lookback; i++) {
    total += monthOutflow({
      entries: args.entries,
      monthKey: addMonths(currentMonth, -i),
    });
  }
  const baselineMonthly = total / lookback;
  const targetAmount = baselineMonthly * targetMonths;

  // Current liquid = positive bank anchors only. Negative
  // (overdraft) banks NEVER count toward the cushion.
  let currentLiquid = 0;
  for (const a of args.accounts) {
    if (!a.active) continue;
    if (a.kind !== "bank") continue;
    const bal = a.anchorBalance ?? 0;
    if (bal > 0) currentLiquid += bal;
  }

  const progress =
    targetAmount > 0 ? Math.min(1, currentLiquid / targetAmount) : 0;
  const monthsCovered =
    baselineMonthly > 0
      ? currentLiquid / baselineMonthly
      : Number.POSITIVE_INFINITY;

  return {
    targetMonths,
    baselineMonthly,
    targetAmount,
    currentLiquid,
    progress,
    monthsCovered,
    rating: rate(progress),
  };
}
