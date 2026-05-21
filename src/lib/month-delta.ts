// Month-over-month delta engine.
//
// Compares the current month's net spend against the previous month
// and surfaces the categories driving the change. Pure compute over
// the entry log — no mutation, no persistence.

import type { CategoryId } from "@/lib/categories";
import type { ExpenseEntry, MonthKey } from "@/types/finance";
import { addMonths } from "@/lib/dates";
import { sliceForMonth } from "@/lib/projections";

export type CategoryDelta = {
  category: CategoryId;
  thisMonth: number;
  priorMonth: number;
  delta: number;
  /** % change; null when priorMonth was 0 (no baseline). */
  deltaPct: number | null;
};

export type MonthDelta = {
  thisMonthTotal: number;
  priorMonthTotal: number;
  /** thisMonth - priorMonth. Negative = saved. */
  delta: number;
  /** % change vs prior; null when prior was 0. */
  deltaPct: number | null;
  topGrew: CategoryDelta[];
  topShrunk: CategoryDelta[];
};

const ROW_FLOOR = 50;

function budgetRelevant(entry: ExpenseEntry): boolean {
  if (entry.isRefund) return false;
  if (entry.excludeFromBudget) return false;
  if (entry.needsConfirmation) return false;
  if (entry.bankPending) return false;
  return true;
}

function sumByCategory(
  entries: ExpenseEntry[],
  monthKey: MonthKey,
): Map<CategoryId, number> {
  const out = new Map<CategoryId, number>();
  for (const entry of entries) {
    if (!budgetRelevant(entry)) continue;
    const slice = sliceForMonth(entry, monthKey);
    if (!slice) continue;
    const cat = entry.category as CategoryId;
    out.set(cat, (out.get(cat) ?? 0) + slice.amount);
  }
  return out;
}

export function monthDelta(args: {
  entries: ExpenseEntry[];
  monthKey: MonthKey;
  topCount?: number;
}): MonthDelta {
  const topCount = args.topCount ?? 3;
  const priorKey = addMonths(args.monthKey, -1);

  const thisByCat = sumByCategory(args.entries, args.monthKey);
  const priorByCat = sumByCategory(args.entries, priorKey);

  const cats = new Set<CategoryId>([
    ...thisByCat.keys(),
    ...priorByCat.keys(),
  ]);

  const rows: CategoryDelta[] = [];
  for (const cat of cats) {
    const thisMonth = thisByCat.get(cat) ?? 0;
    const priorMonth = priorByCat.get(cat) ?? 0;
    if (thisMonth < ROW_FLOOR && priorMonth < ROW_FLOOR) continue;
    const delta = thisMonth - priorMonth;
    const deltaPct = priorMonth > 0 ? (delta / priorMonth) * 100 : null;
    rows.push({ category: cat, thisMonth, priorMonth, delta, deltaPct });
  }

  const thisMonthTotal = Array.from(thisByCat.values()).reduce(
    (s, v) => s + v,
    0,
  );
  const priorMonthTotal = Array.from(priorByCat.values()).reduce(
    (s, v) => s + v,
    0,
  );
  const delta = thisMonthTotal - priorMonthTotal;
  const deltaPct =
    priorMonthTotal > 0 ? (delta / priorMonthTotal) * 100 : null;

  const grew = rows
    .filter((r) => r.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, topCount);
  const shrunk = rows
    .filter((r) => r.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, topCount);

  return {
    thisMonthTotal,
    priorMonthTotal,
    delta,
    deltaPct,
    topGrew: grew,
    topShrunk: shrunk,
  };
}
