// Essentials vs discretionary split.
//
// Splits the current month's slice spend into two buckets so the
// user can see how much of their flow is fixed-cost-of-living
// vs choice. The bucket assignment lives here so future tweaks
// stay in one file (instead of being re-derived per consumer).
//
// Pure compute. Reuses sliceForMonth + the standard noise
// filters.

import type { CategoryId } from "@/lib/categories";
import type { ExpenseEntry, MonthKey } from "@/types/finance";
import { monthKeyOf } from "@/lib/dates";
import { sliceForMonth } from "@/lib/projections";

export type SpendBucket = "essentials" | "discretionary";

const ESSENTIAL_CATEGORIES: ReadonlySet<CategoryId> = new Set<CategoryId>([
  "food",
  "transport",
  "bills",
  "health",
  "education",
]);

export function bucketFor(category: CategoryId): SpendBucket {
  return ESSENTIAL_CATEGORIES.has(category) ? "essentials" : "discretionary";
}

export type SpendSplit = {
  monthKey: MonthKey;
  essentials: number;
  discretionary: number;
  total: number;
  /** essentials ÷ total, 0..1. 0 when total is 0. */
  essentialShare: number;
  /** discretionary ÷ total, 0..1. 0 when total is 0. */
  discretionaryShare: number;
};

export function spendSplit(args: {
  entries: ExpenseEntry[];
  monthKey?: MonthKey;
  now?: Date;
}): SpendSplit {
  const monthKey =
    args.monthKey ?? monthKeyOf(args.now ?? new Date());
  let essentials = 0;
  let discretionary = 0;
  for (const e of args.entries) {
    if (e.isRefund) continue;
    if (e.needsConfirmation) continue;
    if (e.bankPending) continue;
    if (e.excludeFromBudget) continue;
    if (e.currency && e.currency !== "ILS") continue;
    const slice = sliceForMonth(e, monthKey);
    if (!slice) continue;
    if (bucketFor(e.category) === "essentials") essentials += slice.amount;
    else discretionary += slice.amount;
  }
  const total = essentials + discretionary;
  return {
    monthKey,
    essentials,
    discretionary,
    total,
    essentialShare: total > 0 ? essentials / total : 0,
    discretionaryShare: total > 0 ? discretionary / total : 0,
  };
}
