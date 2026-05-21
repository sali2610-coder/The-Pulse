// Single largest charge of the month spotlight.
//
// One-glance answer to "what was the biggest expense this month?".
// Useful before answering "where did the money go?". Pure read over
// the entry log — no mutation, no persistence.

import type { ExpenseEntry, MonthKey } from "@/types/finance";
import { sliceForMonth } from "@/lib/projections";

export type LargestCharge = {
  entryId: string;
  amount: number;
  merchant?: string;
  category: ExpenseEntry["category"];
  chargeDate: Date;
  installments: number;
};

function budgetRelevant(entry: ExpenseEntry): boolean {
  if (entry.isRefund) return false;
  if (entry.excludeFromBudget) return false;
  if (entry.needsConfirmation) return false;
  if (entry.bankPending) return false;
  return true;
}

export function findLargestCharge(args: {
  entries: ExpenseEntry[];
  monthKey: MonthKey;
}): LargestCharge | null {
  let best: LargestCharge | null = null;
  for (const entry of args.entries) {
    if (!budgetRelevant(entry)) continue;
    const slice = sliceForMonth(entry, args.monthKey);
    if (!slice) continue;
    if (!best || slice.amount > best.amount) {
      best = {
        entryId: entry.id,
        amount: slice.amount,
        merchant: entry.merchant,
        category: entry.category,
        chargeDate: slice.chargeDate,
        installments: entry.installments,
      };
    }
  }
  return best;
}
