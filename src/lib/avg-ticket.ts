// Average ticket size trend.
//
// "Are individual charges getting bigger?" A category-agnostic
// signal that complements MonthOverMonth (totals) and CategoryTrends
// (per-category): same number of charges with bigger tickets is
// invisible to those views. This module surfaces avg per-charge
// per month + trend.
//
// Pure compute. Uses ORIGINAL entry amounts, not installment
// slices — the user's "feel" of a charge is the original
// transaction, not the per-month spread.

import type { ExpenseEntry, MonthKey } from "@/types/finance";
import { addMonths, monthKeyOf } from "@/lib/dates";

export type AvgTicketPoint = {
  monthKey: MonthKey;
  count: number;
  total: number;
  avg: number; // 0 when count is 0
};

export type AvgTicketReport = {
  points: AvgTicketPoint[]; // oldest first
  /** Average of the last point vs the average of the prior points.
   *  Signed; positive = tickets growing. NaN-safe via 0 fallback. */
  trend: number;
};

function bucketFor(entry: ExpenseEntry): MonthKey {
  return monthKeyOf(new Date(entry.chargeDate));
}

export function avgTicketTrend(args: {
  entries: ExpenseEntry[];
  /** Last month included (inclusive). Default current month. */
  endMonth?: MonthKey;
  /** Number of months in the series. Default 6. */
  months?: number;
}): AvgTicketReport {
  const months = Math.max(1, args.months ?? 6);
  const end = args.endMonth ?? monthKeyOf(new Date());

  // Build month list oldest → newest.
  const monthKeys: MonthKey[] = [];
  for (let i = months - 1; i >= 0; i--) {
    monthKeys.push(addMonths(end, -i));
  }

  type Bucket = { total: number; count: number };
  const buckets = new Map<MonthKey, Bucket>();
  for (const mk of monthKeys) {
    buckets.set(mk, { total: 0, count: 0 });
  }

  for (const e of args.entries) {
    if (e.isRefund) continue;
    if (e.needsConfirmation) continue;
    if (e.bankPending) continue;
    if (e.excludeFromBudget) continue;
    if (e.currency && e.currency !== "ILS") continue;
    const mk = bucketFor(e);
    const b = buckets.get(mk);
    if (!b) continue; // outside window
    b.total += e.amount;
    b.count += 1;
  }

  const points: AvgTicketPoint[] = monthKeys.map((mk) => {
    const b = buckets.get(mk)!;
    return {
      monthKey: mk,
      count: b.count,
      total: b.total,
      avg: b.count > 0 ? b.total / b.count : 0,
    };
  });

  let trend = 0;
  if (points.length >= 2) {
    const last = points[points.length - 1].avg;
    const priorPts = points
      .slice(0, -1)
      .filter((p) => p.count > 0)
      .map((p) => p.avg);
    if (priorPts.length > 0 && last > 0) {
      const priorAvg =
        priorPts.reduce((a, b) => a + b, 0) / priorPts.length;
      trend = last - priorAvg;
    }
  }

  return { points, trend };
}
