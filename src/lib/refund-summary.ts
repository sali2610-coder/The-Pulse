// Refund / credit-back summary.
//
// Refund entries (isRefund: true) are subtracted from monthly budget
// math but never surfaced as a positive line item. This helper
// totals the credit-backs that have actually been processed this
// month so the user can see "you got ₪X back" — useful for travel
// reconciliation and return tracking.
//
// Pure compute — no mutation, no persistence.

import type { ExpenseEntry, MonthKey } from "@/types/finance";
import { sliceForMonth } from "@/lib/projections";

export type RefundSummary = {
  /** Σ refund slice amounts that landed in this month. */
  total: number;
  /** Number of refund entries contributing. */
  count: number;
  /** Top three refunds by amount for the UI list. */
  topRefunds: Array<{
    entryId: string;
    amount: number;
    merchant?: string;
    chargeDate: Date;
  }>;
};

export function summarizeRefunds(args: {
  entries: ExpenseEntry[];
  monthKey: MonthKey;
}): RefundSummary {
  const rows: Array<{
    entryId: string;
    amount: number;
    merchant?: string;
    chargeDate: Date;
  }> = [];
  for (const entry of args.entries) {
    if (!entry.isRefund) continue;
    if (entry.needsConfirmation) continue;
    if (entry.bankPending) continue;
    if (entry.excludeFromBudget) continue;
    const slice = sliceForMonth(entry, args.monthKey);
    if (!slice) continue;
    rows.push({
      entryId: entry.id,
      amount: slice.amount,
      merchant: entry.merchant,
      chargeDate: slice.chargeDate,
    });
  }
  rows.sort((a, b) => b.amount - a.amount);
  return {
    total: rows.reduce((s, r) => s + r.amount, 0),
    count: rows.length,
    topRefunds: rows.slice(0, 3),
  };
}
