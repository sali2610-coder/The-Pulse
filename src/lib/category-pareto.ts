// Categorical Pareto (80/20 lens).
//
// Sorts the user's category totals for the current month from
// biggest to smallest and finds the smallest set whose summed
// share crosses a configurable threshold (default 80%). Surfaces
// which categories "carry" the month, which is the kind of
// insight CategoryBreakdown (full distribution) makes the user
// re-read every time.
//
// Pure compute. Reuses sliceForMonth so installment slices land
// in the right month at slice amounts.

import type { CategoryId } from "@/lib/categories";
import type { ExpenseEntry, MonthKey } from "@/types/finance";
import { monthKeyOf } from "@/lib/dates";
import { sliceForMonth } from "@/lib/projections";

export type ParetoRow = {
  category: CategoryId;
  total: number;
  share: number; // 0..1
};

export type ParetoReport = {
  monthKey: MonthKey;
  total: number;
  threshold: number; // 0..1
  /** Smallest contiguous-from-top set whose summed share is
   *  >= threshold. Empty when monthly total is 0. */
  dominant: ParetoRow[];
  /** All rows for reference (sorted by total DESC). */
  rows: ParetoRow[];
  /** Σ dominant.share. */
  headlineShare: number;
};

export function categoryPareto(args: {
  entries: ExpenseEntry[];
  monthKey?: MonthKey;
  now?: Date;
  /** Cumulative share threshold the "dominant" set must reach.
   *  Default 0.8 ("the 80% that drives the month"). */
  threshold?: number;
}): ParetoReport {
  const monthKey =
    args.monthKey ?? monthKeyOf(args.now ?? new Date());
  const threshold = Math.max(0, Math.min(1, args.threshold ?? 0.8));

  const buckets = new Map<CategoryId, number>();
  for (const e of args.entries) {
    if (e.isRefund) continue;
    if (e.needsConfirmation) continue;
    if (e.bankPending) continue;
    if (e.excludeFromBudget) continue;
    if (e.currency && e.currency !== "ILS") continue;
    const slice = sliceForMonth(e, monthKey);
    if (!slice) continue;
    buckets.set(e.category, (buckets.get(e.category) ?? 0) + slice.amount);
  }

  const total = Array.from(buckets.values()).reduce((a, b) => a + b, 0);
  const rows: ParetoRow[] = Array.from(buckets.entries())
    .map(([category, t]) => ({
      category,
      total: t,
      share: total > 0 ? t / total : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const dominant: ParetoRow[] = [];
  let running = 0;
  for (const r of rows) {
    if (total === 0) break;
    dominant.push(r);
    running += r.share;
    if (running >= threshold) break;
  }

  return {
    monthKey,
    total,
    threshold,
    dominant,
    rows,
    headlineShare: running,
  };
}
