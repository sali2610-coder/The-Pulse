// Rolling 12-month summary.
//
// Compresses a full year of activity into one set of numbers the
// user can absorb at a glance:
//   totalSpent      — outflow sum across the 365-day window
//   refundCredit    — refund (positive) amounts in the same window
//   netSpent        — totalSpent − refundCredit
//   monthlyAverage  — netSpent ÷ 12
//   dailyAverage    — netSpent ÷ 365
//   chargesCount    — entries fully in the window (each installment
//                     slice counted, refunds excluded)
//   topCategory     — category with the highest net total
//   topMerchant     — merchant with the highest net total
//   monthsWithSpend — distinct months that had at least one slice
//
// Pure compute. Reuses sliceForMonth so installment plans are
// reflected at per-month granularity inside the window.

import type { CategoryId } from "@/lib/categories";
import type { ExpenseEntry, MonthKey } from "@/types/finance";
import { addMonths, monthKeyOf } from "@/lib/dates";
import { sliceForMonth } from "@/lib/projections";

export type YearlySummary = {
  start: Date;
  end: Date;
  totalSpent: number;
  refundCredit: number;
  netSpent: number;
  monthlyAverage: number;
  dailyAverage: number;
  chargesCount: number;
  topCategory:
    | { category: CategoryId; total: number }
    | null;
  topMerchant:
    | { merchant: string; total: number }
    | null;
  monthsWithSpend: number;
};

export function yearlySummary(args: {
  entries: ExpenseEntry[];
  end?: Date;
}): YearlySummary {
  const end = args.end ?? new Date();
  const endMs = end.getTime();
  const startMs = endMs - 365 * 86_400_000;
  const start = new Date(startMs);

  // Build the list of monthKeys the window touches (≤ 13).
  const months: MonthKey[] = [];
  const startKey = monthKeyOf(start);
  const endKey = monthKeyOf(end);
  let m = startKey;
  let safety = 14;
  while (safety-- > 0) {
    months.push(m);
    if (m === endKey) break;
    m = addMonths(m, 1);
  }

  let totalSpent = 0;
  let refundCredit = 0;
  let chargesCount = 0;
  const byCat = new Map<CategoryId, number>();
  const byMerchant = new Map<string, number>();
  const monthsWithSpend = new Set<MonthKey>();

  for (const entry of args.entries) {
    if (entry.needsConfirmation) continue;
    if (entry.bankPending) continue;
    if (entry.excludeFromBudget) continue;
    if (entry.currency && entry.currency !== "ILS") continue;
    for (const mk of months) {
      const slice = sliceForMonth(entry, mk);
      if (!slice) continue;
      const t = slice.chargeDate.getTime();
      if (t < startMs || t > endMs) continue;
      if (entry.isRefund) {
        refundCredit += slice.amount;
        continue;
      }
      totalSpent += slice.amount;
      chargesCount += 1;
      byCat.set(entry.category, (byCat.get(entry.category) ?? 0) + slice.amount);
      if (entry.merchant) {
        byMerchant.set(
          entry.merchant,
          (byMerchant.get(entry.merchant) ?? 0) + slice.amount,
        );
      }
      monthsWithSpend.add(mk);
    }
  }

  const netSpent = totalSpent - refundCredit;

  let topCategory: YearlySummary["topCategory"] = null;
  for (const [cat, total] of byCat) {
    if (!topCategory || total > topCategory.total) {
      topCategory = { category: cat, total };
    }
  }
  let topMerchant: YearlySummary["topMerchant"] = null;
  for (const [merchant, total] of byMerchant) {
    if (!topMerchant || total > topMerchant.total) {
      topMerchant = { merchant, total };
    }
  }

  return {
    start,
    end,
    totalSpent,
    refundCredit,
    netSpent,
    monthlyAverage: netSpent / 12,
    dailyAverage: netSpent / 365,
    chargesCount,
    topCategory,
    topMerchant,
    monthsWithSpend: monthsWithSpend.size,
  };
}
