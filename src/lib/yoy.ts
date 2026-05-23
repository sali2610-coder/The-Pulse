// Year-over-year comparison.
//
// Same calendar month, this year vs last year. Different from
// MonthOverMonth (sequential months) and YearlySummary (rolling
// 365-day total) — surfaces seasonality and habit drift
// ("we spent 30% more on August groceries vs last summer").
//
// Pure compute. Slice-aware via sliceForMonth.

import type { CategoryId } from "@/lib/categories";
import type { ExpenseEntry, MonthKey } from "@/types/finance";
import { addMonths, monthKeyOf } from "@/lib/dates";
import { sliceForMonth } from "@/lib/projections";

export type YoyCategoryDelta = {
  category: CategoryId;
  thisYear: number;
  lastYear: number;
  delta: number;
  deltaPct: number; // signed; Infinity when lastYear is 0
};

export type YoyReport = {
  thisMonth: MonthKey;
  priorMonth: MonthKey; // 12 months before
  thisYearTotal: number;
  lastYearTotal: number;
  delta: number;
  deltaPct: number;
  topMovers: YoyCategoryDelta[];
};

function bucketMonth(args: {
  entries: ExpenseEntry[];
  monthKey: MonthKey;
}): { total: number; byCat: Map<CategoryId, number> } {
  let total = 0;
  const byCat = new Map<CategoryId, number>();
  for (const e of args.entries) {
    if (e.isRefund) continue;
    if (e.needsConfirmation) continue;
    if (e.bankPending) continue;
    if (e.excludeFromBudget) continue;
    if (e.currency && e.currency !== "ILS") continue;
    const slice = sliceForMonth(e, args.monthKey);
    if (!slice) continue;
    total += slice.amount;
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + slice.amount);
  }
  return { total, byCat };
}

export function yoyReport(args: {
  entries: ExpenseEntry[];
  monthKey?: MonthKey;
  now?: Date;
}): YoyReport {
  const thisMonth =
    args.monthKey ?? monthKeyOf(args.now ?? new Date());
  const priorMonth = addMonths(thisMonth, -12);

  const a = bucketMonth({ entries: args.entries, monthKey: thisMonth });
  const b = bucketMonth({ entries: args.entries, monthKey: priorMonth });

  const cats = new Set<CategoryId>([...a.byCat.keys(), ...b.byCat.keys()]);
  const movers: YoyCategoryDelta[] = [];
  for (const cat of cats) {
    const thisYear = a.byCat.get(cat) ?? 0;
    const lastYear = b.byCat.get(cat) ?? 0;
    const delta = thisYear - lastYear;
    if (delta === 0) continue;
    const deltaPct =
      lastYear === 0
        ? Number.POSITIVE_INFINITY
        : (delta / lastYear) * 100;
    movers.push({ category: cat, thisYear, lastYear, delta, deltaPct });
  }
  movers.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

  const delta = a.total - b.total;
  const deltaPct =
    b.total === 0 ? Number.POSITIVE_INFINITY : (delta / b.total) * 100;

  return {
    thisMonth,
    priorMonth,
    thisYearTotal: a.total,
    lastYearTotal: b.total,
    delta,
    deltaPct,
    topMovers: movers.slice(0, 3),
  };
}
