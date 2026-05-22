// Per-category spend pace.
//
// For each spending category in the current month:
//   spentSoFar     — slice amounts charged from day 1 to `now`
//   projectedEOM   — spentSoFar × (daysInMonth / dayOfMonth)
//   priorMedian    — median of the same category's totals across
//                    the last 3 completed months
//   deltaVsPrior   — projectedEOM - priorMedian  (signed)
//
// Pure compute. Different from CategoryTrends which compares LAST
// month vs prior average. This module asks "where will THIS month
// land per category if we keep this pace".

import type { CategoryId } from "@/lib/categories";
import type { ExpenseEntry, MonthKey } from "@/types/finance";
import {
  daysInMonth,
  sliceForMonth,
} from "@/lib/projections";
import { addMonths, monthKeyOf } from "@/lib/dates";

export type CategoryPaceRow = {
  category: CategoryId;
  spentSoFar: number;
  projectedEOM: number;
  priorMedian: number;
  /** projectedEOM - priorMedian. Positive = pacing higher than past. */
  deltaVsPrior: number;
};

function sliceCategoryTotals(args: {
  entries: ExpenseEntry[];
  monthKey: MonthKey;
  // when set, only count slices whose chargeDate is at or before this date
  uptoMs?: number;
}): Map<CategoryId, number> {
  const out = new Map<CategoryId, number>();
  for (const e of args.entries) {
    if (e.isRefund) continue;
    if (e.needsConfirmation) continue;
    if (e.bankPending) continue;
    if (e.excludeFromBudget) continue;
    if (e.currency && e.currency !== "ILS") continue;
    const slice = sliceForMonth(e, args.monthKey);
    if (!slice) continue;
    if (args.uptoMs !== undefined && slice.chargeDate.getTime() > args.uptoMs) {
      continue;
    }
    out.set(e.category, (out.get(e.category) ?? 0) + slice.amount);
  }
  return out;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function categoryPace(args: {
  entries: ExpenseEntry[];
  monthKey?: MonthKey;
  now?: Date;
  /** How many prior months to baseline against. Default 3. */
  lookback?: number;
}): CategoryPaceRow[] {
  const now = args.now ?? new Date();
  const monthKey = args.monthKey ?? monthKeyOf(now);
  const isCurrent = monthKeyOf(now) === monthKey;
  const last = daysInMonth(monthKey);
  const day = isCurrent ? now.getDate() : last;

  const spentMap = sliceCategoryTotals({
    entries: args.entries,
    monthKey,
    uptoMs: isCurrent ? now.getTime() : undefined,
  });

  // Build prior-month per-category history.
  const lookback = args.lookback ?? 3;
  const priorByCat = new Map<CategoryId, number[]>();
  for (let i = 1; i <= lookback; i++) {
    const mk = addMonths(monthKey, -i);
    const totals = sliceCategoryTotals({
      entries: args.entries,
      monthKey: mk,
    });
    for (const [cat, sum] of totals) {
      const arr = priorByCat.get(cat) ?? [];
      arr.push(sum);
      priorByCat.set(cat, arr);
    }
  }

  // Union of categories that appear in the current month OR history.
  const cats = new Set<CategoryId>([
    ...spentMap.keys(),
    ...priorByCat.keys(),
  ]);

  const out: CategoryPaceRow[] = [];
  for (const cat of cats) {
    const spentSoFar = spentMap.get(cat) ?? 0;
    // Linear pace projection. Day 0 (extremely unusual) → no pace.
    const projectedEOM = day > 0 ? (spentSoFar * last) / day : spentSoFar;
    const priorMedian = median(priorByCat.get(cat) ?? []);
    out.push({
      category: cat,
      spentSoFar,
      projectedEOM,
      priorMedian,
      deltaVsPrior: projectedEOM - priorMedian,
    });
  }
  // Sort by projectedEOM desc; categories with 0 spent + 0 history at
  // the bottom (those have projectedEOM = 0 already).
  out.sort((a, b) => b.projectedEOM - a.projectedEOM);
  return out;
}
