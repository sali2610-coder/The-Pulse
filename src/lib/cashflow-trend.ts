// Net cashflow + savings-rate trend.
//
// For each of the last N months compute:
//   income   — sum of active monthly Income amounts
//   expense  — sum of budget-relevant ExpenseEntry slices for the month
//   net      — income - expense
//   savingsRate — net / income (null when income is zero)
//
// Pure compute. Income amounts are treated as monthly expectations
// (no per-month variance — that's the closest signal until incomes
// gain SMS ingestion).

import type { ExpenseEntry, Income, MonthKey } from "@/types/finance";
import { addMonths } from "@/lib/dates";
import { sliceForMonth } from "@/lib/projections";

export type CashflowMonth = {
  monthKey: MonthKey;
  income: number;
  expense: number;
  net: number;
  /** net / income; null when income was zero. */
  savingsRate: number | null;
};

export type CashflowTrend = {
  months: CashflowMonth[];
  /** Arithmetic mean of `net` across months. */
  averageNet: number;
  /** Arithmetic mean of savingsRate (excluding nulls). */
  averageSavingsRate: number | null;
  /** Highest single-month net. */
  bestMonth: CashflowMonth | null;
  /** Lowest single-month net (most negative or smallest). */
  worstMonth: CashflowMonth | null;
};

function expenseFor(entries: ExpenseEntry[], monthKey: MonthKey): number {
  let total = 0;
  for (const entry of entries) {
    if (entry.isRefund) continue;
    if (entry.excludeFromBudget) continue;
    if (entry.needsConfirmation) continue;
    if (entry.bankPending) continue;
    const slice = sliceForMonth(entry, monthKey);
    if (!slice) continue;
    total += slice.amount;
  }
  return total;
}

function incomeFor(incomes: Income[]): number {
  return incomes.reduce(
    (sum, i) => (i.active ? sum + i.amount : sum),
    0,
  );
}

export function cashflowTrend(args: {
  entries: ExpenseEntry[];
  incomes: Income[];
  monthKey: MonthKey;
  lookback?: number;
}): CashflowTrend {
  const lookback = args.lookback ?? 6;
  const income = incomeFor(args.incomes);

  const months: CashflowMonth[] = [];
  for (let i = lookback - 1; i >= 0; i--) {
    const mk = addMonths(args.monthKey, -i);
    const expense = expenseFor(args.entries, mk);
    const net = income - expense;
    const savingsRate = income > 0 ? net / income : null;
    months.push({ monthKey: mk, income, expense, net, savingsRate });
  }

  const averageNet =
    months.length > 0
      ? months.reduce((s, m) => s + m.net, 0) / months.length
      : 0;
  const savingsRates = months
    .map((m) => m.savingsRate)
    .filter((r): r is number => r !== null);
  const averageSavingsRate =
    savingsRates.length > 0
      ? savingsRates.reduce((s, v) => s + v, 0) / savingsRates.length
      : null;

  let bestMonth: CashflowMonth | null = null;
  let worstMonth: CashflowMonth | null = null;
  for (const m of months) {
    if (!bestMonth || m.net > bestMonth.net) bestMonth = m;
    if (!worstMonth || m.net < worstMonth.net) worstMonth = m;
  }

  return {
    months,
    averageNet,
    averageSavingsRate,
    bestMonth,
    worstMonth,
  };
}
