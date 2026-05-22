// Savings rate.
//
// Flow-based companion to NetWorthCard. For each month:
//   income   = Σ active incomes scheduled to fire that month
//   outflow  = Σ entry-slice amounts that fall in that month
//              (excluding refunds + pending + needsConfirmation +
//              non-ILS + excludeFromBudget) + Σ pending recurring
//              + Σ active loan installments due that month
//   rate     = (income - outflow) / income     [signed; >0 saving]
//
// Reuses obligationsTimeline so the math matches the multi-month
// outflow card. Pure compute. No React. No store.

import type { ExpenseEntry, Income, Loan, MonthKey, RecurringRule, RecurringStatus } from "@/types/finance";
import { obligationsTimeline } from "@/lib/obligations";
import { monthKeyOf } from "@/lib/dates";

export type SavingsRatePoint = {
  monthKey: MonthKey;
  income: number;
  outflow: number;
  net: number;
  rate: number; // -Infinity..1; >0 saving; Infinity when income 0 and outflow 0
};

export type SavingsRateTimeline = {
  points: SavingsRatePoint[];
  averageRate: number; // arithmetic mean of finite rates; 0 when none
};

function calcRate(income: number, outflow: number): number {
  if (income === 0 && outflow === 0) return 0;
  if (income === 0) return -Infinity; // spent without earning
  return (income - outflow) / income;
}

export function savingsRateTimeline(args: {
  rules: RecurringRule[];
  loans: Loan[];
  incomes: Income[];
  entries: ExpenseEntry[];
  statuses: RecurringStatus[];
  /** Inclusive last month (defaults to current month). */
  endMonth?: MonthKey;
  /** How many months back including endMonth. Defaults to 6. */
  months?: number;
}): SavingsRateTimeline {
  const end = args.endMonth ?? monthKeyOf(new Date());
  const months = args.months ?? 6;

  // obligationsTimeline can project forward; for history we need to
  // pass a startMonth = end - (months - 1). The lib accepts forward
  // projection so we walk backwards by computing startMonth here.
  const [yearStr, monthStr] = end.split("-");
  const endYear = Number(yearStr);
  const endMonthIdx0 = Number(monthStr) - 1; // 0-based
  const startMonthIdx0 = endMonthIdx0 - (months - 1);
  let startYear = endYear;
  let startMonth = startMonthIdx0;
  while (startMonth < 0) {
    startMonth += 12;
    startYear -= 1;
  }
  const startKey: MonthKey = `${startYear}-${String(startMonth + 1).padStart(2, "0")}`;

  const tl = obligationsTimeline({
    rules: args.rules,
    loans: args.loans,
    incomes: args.incomes,
    entries: args.entries,
    statuses: args.statuses,
    startMonth: startKey,
    months,
  });

  const points: SavingsRatePoint[] = tl.map((m) => ({
    monthKey: m.monthKey,
    income: m.income,
    outflow: m.outflow,
    net: m.net,
    rate: calcRate(m.income, m.outflow),
  }));

  const finiteRates = points
    .map((p) => p.rate)
    .filter((r) => Number.isFinite(r));
  const averageRate =
    finiteRates.length > 0
      ? finiteRates.reduce((a, b) => a + b, 0) / finiteRates.length
      : 0;

  return { points, averageRate };
}
