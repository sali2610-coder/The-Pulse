// Income source breakdown.
//
// Aggregates active Income records and recent refund credit into
// a per-source share so the user can see "where my money comes
// from this month". Income share % is computed from monthly
// amounts; refund credit is folded in as a separate source
// because it behaves differently (one-off positive flow, not
// guaranteed).
//
// Pure compute. No React. No store.

import type { ExpenseEntry, Income, MonthKey } from "@/types/finance";
import { monthKeyOf } from "@/lib/dates";
import { sliceForMonth } from "@/lib/projections";
import { incomeForMonth } from "@/lib/income-month";

export type IncomeSource = {
  id: string;
  label: string;
  amount: number;
  /** amount ÷ totalMonthly, 0..1. */
  share: number;
  /** True when the source is a refund-credit fold-in, not a
   *  scheduled Income record. */
  isRefund?: boolean;
};

export type IncomeBreakdown = {
  totalMonthly: number;
  sources: IncomeSource[];
};

function refundCreditThisMonth(args: {
  entries: ExpenseEntry[];
  monthKey: MonthKey;
}): number {
  let sum = 0;
  for (const e of args.entries) {
    if (!e.isRefund) continue;
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

export function incomeBreakdown(args: {
  incomes: Income[];
  entries: ExpenseEntry[];
  monthKey?: MonthKey;
  now?: Date;
}): IncomeBreakdown {
  const monthKey = args.monthKey ?? monthKeyOf(args.now ?? new Date());
  const sources: IncomeSource[] = [];
  let total = 0;
  for (const inc of args.incomes) {
    if (!inc.active) continue;
    if (inc.amount <= 0) continue;
    // Phase 335 — when the user typed an actual amount for this
    // specific month, the source row + total should reflect what
    // actually landed. Future-month projections still read the
    // baseline; this is the current month only.
    const monthAmount = incomeForMonth(inc, monthKey);
    if (monthAmount <= 0) continue;
    sources.push({
      id: inc.id,
      label: inc.label,
      amount: monthAmount,
      share: 0, // filled below once total known
    });
    total += monthAmount;
  }
  const refund = refundCreditThisMonth({
    entries: args.entries,
    monthKey,
  });
  if (refund > 0) {
    sources.push({
      id: "__refunds__",
      label: "זיכויים החודש",
      amount: refund,
      share: 0,
      isRefund: true,
    });
    total += refund;
  }
  if (total > 0) {
    for (const s of sources) s.share = s.amount / total;
  }
  sources.sort((a, b) => b.amount - a.amount);
  return { totalMonthly: total, sources };
}
