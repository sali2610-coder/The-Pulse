// Weekend vs weekday spend lens.
//
// Israel weekend = Friday (5) + Saturday (6) by JS `getDay()`
// convention. The lens surfaces what share of monthly spend lands
// on the weekend so the user can see lifestyle drift the per-
// category cards don't expose (e.g. weekday cafés vs weekend
// restaurants both sit in `food`).
//
// Pure compute. Reuses sliceForMonth so installment plans count
// at their slice amount on the slice's chargeDate.

import type { ExpenseEntry, MonthKey } from "@/types/finance";
import { monthKeyOf, addMonths } from "@/lib/dates";
import { sliceForMonth } from "@/lib/projections";

export type WeekendSpend = {
  monthKey: MonthKey;
  weekendTotal: number;
  weekdayTotal: number;
  total: number;
  /** weekendTotal ÷ total, 0..1. 0 when total is 0. */
  weekendShare: number;
  /** Per-month points for the prior `lookback` months, oldest
   *  first. The current month is index 0 of `current`. */
};

export type WeekendSpendReport = {
  current: WeekendSpend;
  prior: WeekendSpend[]; // oldest first, length === lookback
  /** weekendShare current − average of prior. */
  shareDelta: number;
};

const WEEKEND = new Set<number>([5, 6]); // Friday, Saturday

function monthSpend(args: {
  entries: ExpenseEntry[];
  monthKey: MonthKey;
}): WeekendSpend {
  let weekend = 0;
  let weekday = 0;
  for (const e of args.entries) {
    if (e.isRefund) continue;
    if (e.needsConfirmation) continue;
    if (e.bankPending) continue;
    if (e.excludeFromBudget) continue;
    if (e.currency && e.currency !== "ILS") continue;
    const slice = sliceForMonth(e, args.monthKey);
    if (!slice) continue;
    const d = slice.chargeDate.getDay();
    if (WEEKEND.has(d)) weekend += slice.amount;
    else weekday += slice.amount;
  }
  const total = weekend + weekday;
  return {
    monthKey: args.monthKey,
    weekendTotal: weekend,
    weekdayTotal: weekday,
    total,
    weekendShare: total > 0 ? weekend / total : 0,
  };
}

export function weekendSpendReport(args: {
  entries: ExpenseEntry[];
  monthKey?: MonthKey;
  /** How many prior months to baseline against. Default 3. */
  lookback?: number;
  now?: Date;
}): WeekendSpendReport {
  const monthKey = args.monthKey ?? monthKeyOf(args.now ?? new Date());
  const lookback = Math.max(1, args.lookback ?? 3);
  const current = monthSpend({ entries: args.entries, monthKey });
  const prior: WeekendSpend[] = [];
  for (let i = lookback; i >= 1; i--) {
    prior.push(
      monthSpend({
        entries: args.entries,
        monthKey: addMonths(monthKey, -i),
      }),
    );
  }
  const priorShares = prior
    .map((p) => p.weekendShare)
    .filter((_, i) => prior[i].total > 0);
  const priorAvg =
    priorShares.length > 0
      ? priorShares.reduce((a, b) => a + b, 0) / priorShares.length
      : 0;
  return {
    current,
    prior,
    shareDelta: current.weekendShare - priorAvg,
  };
}
