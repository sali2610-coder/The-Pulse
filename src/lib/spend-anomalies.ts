// Per-category spend anomaly detection.
//
// Layers on top of `categoryTrends` from forecast.ts: filters to
// categories that are spiking hard vs. the user's own 3-month
// baseline and reports them as actionable alerts. Used by the
// dashboard banner that warns "you're spending 3x more on food
// this month".
//
// Pure compute — no mutation, no persistence, idempotent.

import type { ExpenseEntry, MonthKey } from "@/types/finance";
import type { CategoryId } from "@/lib/categories";
import { categoryTrends } from "@/lib/forecast";
import { addMonths } from "@/lib/dates";
import { sliceForMonth } from "@/lib/projections";

export type SpendAnomaly = {
  category: CategoryId;
  thisMonth: number;
  priorAverage: number;
  delta: number;
  /** Multiplier — thisMonth / priorAverage. Always >= 1 for surfaced rows. */
  ratio: number;
  /** "watch" 1.5×–2×, "alert" > 2×. */
  severity: "watch" | "alert";
  /** Number of prior months that contributed to the baseline. */
  priorMonthsCovered: number;
};

const FLOOR_ILS = 100;
const WATCH_RATIO = 1.5;
const ALERT_RATIO = 2.0;
const MIN_PRIOR_MONTHS = 2;

export function detectSpendAnomalies(args: {
  entries: ExpenseEntry[];
  monthKey: MonthKey;
  lookback?: number;
}): SpendAnomaly[] {
  const lookback = args.lookback ?? 3;
  const trends = categoryTrends({
    entries: args.entries,
    monthKey: args.monthKey,
    lookback,
  });

  // Re-derive prior month coverage per category since categoryTrends
  // doesn't expose it. Cheap pass — already O(entries) once above.
  const priorMonthsByCat = new Map<string, Set<string>>();
  for (const entry of args.entries) {
    for (let i = 1; i <= lookback; i++) {
      const prior = addMonths(args.monthKey, -i);
      const priorSlice = sliceForMonth(entry, prior);
      if (priorSlice) {
        const set = priorMonthsByCat.get(entry.category) ?? new Set<string>();
        set.add(prior);
        priorMonthsByCat.set(entry.category, set);
      }
    }
  }

  const out: SpendAnomaly[] = [];
  for (const t of trends) {
    if (t.thisMonth < FLOOR_ILS) continue;
    if (t.priorAverage <= 0) continue;
    const priorMonths = priorMonthsByCat.get(t.category)?.size ?? 0;
    if (priorMonths < MIN_PRIOR_MONTHS) continue;
    const ratio = t.thisMonth / t.priorAverage;
    if (ratio < WATCH_RATIO) continue;
    const severity: SpendAnomaly["severity"] =
      ratio >= ALERT_RATIO ? "alert" : "watch";
    out.push({
      category: t.category as CategoryId,
      thisMonth: t.thisMonth,
      priorAverage: t.priorAverage,
      delta: t.delta,
      ratio,
      severity,
      priorMonthsCovered: priorMonths,
    });
  }

  // Most severe first; ties broken by absolute delta.
  out.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "alert" ? -1 : 1;
    return b.delta - a.delta;
  });

  return out;
}
