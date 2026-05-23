// Spending Truth — extended version of `monthlySpent` with the
// supporting facts the "actual spent this month" card needs:
//
//   - dailyAverage          spentSoFar / dayOfMonth
//   - biggestCategory       category id + total + share
//   - priorMonthSpentSoFar  prior month spend through the same dayOfMonth
//   - delta                 spentSoFar - priorMonthSpentSoFar
//   - burnRate              "calm" | "steady" | "hot"
//
// burnRate is a coarse pace bucket — derived from "what fraction of
// the projected EOM run-rate has already been spent". Calm = below
// proportional pace; steady = within ±5%; hot = at least 5% ahead.
//
// Pure compute. Re-uses monthlySpent for the canonical "already spent"
// number so no two cards disagree on the headline.

import type { CategoryId } from "@/lib/categories";
import type { ExpenseEntry, MonthKey } from "@/types/finance";
import { addMonths, monthKeyOf } from "@/lib/dates";
import { sliceForMonth, daysInMonth } from "@/lib/projections";
import { monthlySpent, type MonthlySpent } from "@/lib/monthly-spent";

export type BurnRate = "calm" | "steady" | "hot";

export type SpendingTruth = MonthlySpent & {
  dayOfMonth: number;
  daysInMonth: number;
  dailyAverage: number;
  biggestCategory:
    | { category: CategoryId; amount: number; share: number }
    | null;
  priorMonthSpentSoFar: number;
  /** spentSoFar - priorMonthSpentSoFar. Positive = pacing higher than
   *  last month at this point. */
  delta: number;
  burnRate: BurnRate;
};

export function spendingTruth(args: {
  entries: ExpenseEntry[];
  monthKey?: MonthKey;
  now?: Date;
}): SpendingTruth {
  const now = args.now ?? new Date();
  const monthKey: MonthKey = args.monthKey ?? monthKeyOf(now);
  const total = daysInMonth(monthKey);
  const day = Math.max(1, monthKeyOf(now) === monthKey ? now.getDate() : 1);
  const base = monthlySpent({ entries: args.entries, monthKey, now });

  const dailyAverage =
    day > 0 ? Math.round((base.spentSoFar / day) * 100) / 100 : 0;

  const biggestCategory = pickBiggestCategory({
    entries: args.entries,
    monthKey,
    nowMs: now.getTime(),
    totalSpend: base.spentSoFar,
  });

  // Prior month through the same dayOfMonth → meaningful MoM compare
  // at any point in the month.
  const priorKey = addMonths(monthKey, -1);
  const priorMonthSpentSoFar = sumThroughDay({
    entries: args.entries,
    monthKey: priorKey,
    throughDay: day,
  });
  const delta = base.spentSoFar - priorMonthSpentSoFar;

  // Burn rate. Compare proportional pace vs run-rate baseline. "calm"
  // when we're at least 5% under the linear pace, "hot" when at least
  // 5% over, "steady" in between.
  const proportional = (base.spentSoFar / day) * total;
  const baseline =
    priorMonthSpentSoFar > 0 ? priorMonthSpentSoFar * (total / day) : 0;
  let burnRate: BurnRate = "steady";
  if (baseline > 0) {
    const ratio = proportional / baseline;
    if (ratio <= 0.95) burnRate = "calm";
    else if (ratio >= 1.05) burnRate = "hot";
  }

  return {
    ...base,
    dayOfMonth: day,
    daysInMonth: total,
    dailyAverage,
    biggestCategory,
    priorMonthSpentSoFar: round2(priorMonthSpentSoFar),
    delta: round2(delta),
    burnRate,
  };
}

function pickBiggestCategory(args: {
  entries: ExpenseEntry[];
  monthKey: MonthKey;
  nowMs: number;
  totalSpend: number;
}): SpendingTruth["biggestCategory"] {
  const totals = new Map<CategoryId, number>();
  for (const e of args.entries) {
    if (e.needsConfirmation) continue;
    if (e.bankPending) continue;
    if (e.excludeFromBudget) continue;
    if (e.isRefund) continue;
    if (e.currency && e.currency !== "ILS") continue;
    const slice = sliceForMonth(e, args.monthKey);
    if (!slice) continue;
    if (slice.chargeDate.getTime() > args.nowMs) continue;
    totals.set(e.category, (totals.get(e.category) ?? 0) + slice.amount);
  }
  let best: { category: CategoryId; amount: number } | null = null;
  for (const [cat, amt] of totals) {
    if (!best || amt > best.amount) best = { category: cat, amount: amt };
  }
  if (!best || args.totalSpend === 0) return null;
  return {
    category: best.category,
    amount: round2(best.amount),
    share: Math.round((best.amount / args.totalSpend) * 100) / 100,
  };
}

function sumThroughDay(args: {
  entries: ExpenseEntry[];
  monthKey: MonthKey;
  throughDay: number;
}): number {
  let s = 0;
  for (const e of args.entries) {
    if (e.needsConfirmation) continue;
    if (e.bankPending) continue;
    if (e.excludeFromBudget) continue;
    if (e.isRefund) continue;
    if (e.currency && e.currency !== "ILS") continue;
    const slice = sliceForMonth(e, args.monthKey);
    if (!slice) continue;
    if (slice.chargeDate.getDate() > args.throughDay) continue;
    s += slice.amount;
  }
  return s;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
