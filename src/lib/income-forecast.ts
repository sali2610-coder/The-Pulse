// Income forecast.
//
// Estimates expected income for the current and next calendar month
// from two signals:
//   1. Scheduled `Income` records (fixed monthly inflow).
//   2. Irregular credits from the entry log — refund / `isRefund` rows
//      treated as positive cash flow. Averaged across the last N
//      complete months and projected forward.
//
// Confidence is a coarse bucket:
//   - high   — fixed scheduled income only, ≥1 source, ≥3 months of
//              consistent history.
//   - medium — mix of scheduled + irregular, OR scheduled-only with
//              <3 months of history.
//   - low    — irregular-only, or no scheduled income at all.
//
// Pure compute. No store. No React.

import type { ExpenseEntry, Income, MonthKey } from "@/types/finance";
import { addMonths, monthKeyOf } from "@/lib/dates";
import { sliceForMonth } from "@/lib/projections";

export type IncomeConfidence = "low" | "medium" | "high";

export type IncomeForecast = {
  monthKey: MonthKey;
  /** Sum of active scheduled Income amounts. Stable across months
   *  until the user edits a record. */
  scheduledMonthly: number;
  /** Trailing-window average of refund credits per month. */
  irregularMonthly: number;
  /** scheduledMonthly + irregularMonthly. */
  expectedTotal: number;
  /** Same shape, one month forward. */
  nextMonth: {
    monthKey: MonthKey;
    scheduledMonthly: number;
    irregularMonthly: number;
    expectedTotal: number;
  };
  /** Number of prior complete months the average was computed over. */
  lookbackMonths: number;
  confidence: IncomeConfidence;
};

const DEFAULT_LOOKBACK = 3;

export function incomeForecast(args: {
  incomes: Income[];
  entries: ExpenseEntry[];
  monthKey?: MonthKey;
  now?: Date;
  lookbackMonths?: number;
}): IncomeForecast {
  const now = args.now ?? new Date();
  const monthKey: MonthKey = args.monthKey ?? monthKeyOf(now);
  const lookback = Math.max(1, args.lookbackMonths ?? DEFAULT_LOOKBACK);

  const scheduledMonthly = sumScheduledMonthly(args.incomes);
  const irregularMonthly = averageIrregularMonthly({
    entries: args.entries,
    endMonthExclusive: monthKey,
    lookbackMonths: lookback,
  });

  const expectedTotal = scheduledMonthly + irregularMonthly;
  const nextKey = addMonths(monthKey, 1);

  return {
    monthKey,
    scheduledMonthly,
    irregularMonthly,
    expectedTotal,
    nextMonth: {
      monthKey: nextKey,
      scheduledMonthly,
      irregularMonthly,
      expectedTotal,
    },
    lookbackMonths: lookback,
    confidence: bucketConfidence({
      scheduledMonthly,
      irregularMonthly,
      lookbackMonths: lookback,
    }),
  };
}

function sumScheduledMonthly(incomes: Income[]): number {
  let s = 0;
  for (const inc of incomes) {
    if (!inc.active) continue;
    if (inc.amount <= 0) continue;
    s += inc.amount;
  }
  return s;
}

function averageIrregularMonthly(args: {
  entries: ExpenseEntry[];
  endMonthExclusive: MonthKey;
  lookbackMonths: number;
}): number {
  let total = 0;
  let observed = 0;
  for (let i = 1; i <= args.lookbackMonths; i++) {
    const mk = addMonths(args.endMonthExclusive, -i);
    let monthSum = 0;
    for (const e of args.entries) {
      if (!e.isRefund) continue;
      if (e.needsConfirmation) continue;
      if (e.bankPending) continue;
      if (e.excludeFromBudget) continue;
      if (e.currency && e.currency !== "ILS") continue;
      const slice = sliceForMonth(e, mk);
      if (!slice) continue;
      monthSum += slice.amount;
    }
    total += monthSum;
    observed++;
  }
  if (observed === 0) return 0;
  return total / observed;
}

function bucketConfidence(args: {
  scheduledMonthly: number;
  irregularMonthly: number;
  lookbackMonths: number;
}): IncomeConfidence {
  const hasScheduled = args.scheduledMonthly > 0;
  const hasIrregular = args.irregularMonthly > 0;
  if (!hasScheduled && !hasIrregular) return "low";
  if (!hasScheduled) return "low";
  if (hasScheduled && !hasIrregular && args.lookbackMonths >= 3) {
    return "high";
  }
  return "medium";
}
