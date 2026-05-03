import type { ExpenseEntry, RecurringRule, RecurringStatus } from "@/types/finance";
import type { MonthKey } from "@/types/finance";
import { daysInMonth, projectMonth, sliceForMonth } from "@/lib/projections";
import { addMonths, dayWithinMonth, monthKeyOf } from "@/lib/dates";

export type ForecastConfidence = "low" | "medium" | "high";

export type Forecast = {
  /** Where you'll land at end-of-month if today's pace holds. */
  projectedTotal: number;
  /** projectedTotal − budget. Negative = under budget. */
  variance: number;
  /** % faster (+) / slower (−) than the same point in previous months. */
  paceVsHistorical: number | null;
  /** Day-of-month when actual is expected to cross the budget; undefined if no breach. */
  breachDay?: number;
  /** Average ₪/day spent so far this month. */
  dailyBurn: number;
  /** Average ₪/day across the lookback window (same point of month). */
  historicalDailyBurn: number | null;
  /** How much we trust the projection. */
  confidence: ForecastConfidence;
  /** Days of data used in the projection. */
  daysObserved: number;
  /** Total days in the target month. */
  totalDays: number;
};

const HISTORICAL_LOOKBACK_MONTHS = 3;

function totalSlicesForMonth(
  entries: ExpenseEntry[],
  monthKey: MonthKey,
): number {
  let total = 0;
  for (const entry of entries) {
    const slice = sliceForMonth(entry, monthKey);
    if (slice) total += slice.amount;
  }
  return total;
}

function actualByDayOfMonth(
  entries: ExpenseEntry[],
  monthKey: MonthKey,
  day: number,
): number {
  let total = 0;
  for (const entry of entries) {
    const slice = sliceForMonth(entry, monthKey);
    if (!slice) continue;
    if (slice.chargeDate.getDate() <= day) total += slice.amount;
  }
  return total;
}

export function forecastMonthEnd(args: {
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  monthlyBudget: number;
  monthKey: MonthKey;
  now?: Date;
}): Forecast {
  const now = args.now ?? new Date();
  const totalDays = daysInMonth(args.monthKey);
  const isCurrentMonth = monthKeyOf(now) === args.monthKey;
  const dayOfMonth = isCurrentMonth ? now.getDate() : totalDays;

  const proj = projectMonth({
    entries: args.entries,
    rules: args.rules,
    statuses: args.statuses,
    monthKey: args.monthKey,
    now,
  });

  const dailyBurn = dayOfMonth > 0 ? proj.actual / dayOfMonth : 0;
  const remainingDays = Math.max(0, totalDays - dayOfMonth);

  // Linear extrapolation of variable spending + scheduled commitments.
  // - actual: already-charged slices
  // - linearVariable: today's daily burn projected over remaining days
  // - committed: future installments in this month + pending recurring rules
  //   (already counted in proj.upcoming, but proj.upcoming also includes
  //   rules — we use that directly to avoid double counting).
  const linearVariable = dailyBurn * remainingDays;
  const projectedTotal = proj.actual + Math.max(linearVariable, proj.upcoming);

  const variance = projectedTotal - args.monthlyBudget;

  // Historical pace: same day-of-month over the last N months.
  const historical = collectHistoricalDailyBurn({
    entries: args.entries,
    monthKey: args.monthKey,
    upToDay: dayOfMonth,
    lookback: HISTORICAL_LOOKBACK_MONTHS,
  });
  const historicalDailyBurn = historical.daily;
  const paceVsHistorical =
    historicalDailyBurn !== null && historicalDailyBurn > 0
      ? ((dailyBurn - historicalDailyBurn) / historicalDailyBurn) * 100
      : null;

  // When (if ever) does actual cross the budget?
  let breachDay: number | undefined;
  if (
    args.monthlyBudget > 0 &&
    proj.actual <= args.monthlyBudget &&
    dailyBurn > 0
  ) {
    const remainingBudget = args.monthlyBudget - proj.actual;
    const daysUntilBreach = remainingBudget / dailyBurn;
    const projectedBreachDay = Math.ceil(dayOfMonth + daysUntilBreach);
    if (projectedBreachDay <= totalDays) {
      breachDay = projectedBreachDay;
    }
  } else if (proj.actual > args.monthlyBudget) {
    breachDay = dayOfMonth;
  }

  const confidence = determineConfidence({
    daysObserved: dayOfMonth,
    historicalMonths: historical.monthsCounted,
  });

  return {
    projectedTotal,
    variance,
    paceVsHistorical,
    breachDay,
    dailyBurn,
    historicalDailyBurn,
    confidence,
    daysObserved: dayOfMonth,
    totalDays,
  };
}

function collectHistoricalDailyBurn(args: {
  entries: ExpenseEntry[];
  monthKey: MonthKey;
  upToDay: number;
  lookback: number;
}): { daily: number | null; monthsCounted: number } {
  let totalSpend = 0;
  let totalDays = 0;
  let monthsCounted = 0;
  for (let i = 1; i <= args.lookback; i++) {
    const prior = addMonths(args.monthKey, -i);
    const sumThroughDay = actualByDayOfMonth(args.entries, prior, args.upToDay);
    if (sumThroughDay > 0) {
      totalSpend += sumThroughDay;
      totalDays += args.upToDay;
      monthsCounted += 1;
    }
  }
  return {
    daily: totalDays > 0 ? totalSpend / totalDays : null,
    monthsCounted,
  };
}

function determineConfidence(args: {
  daysObserved: number;
  historicalMonths: number;
}): ForecastConfidence {
  if (args.daysObserved < 4) return "low";
  if (args.daysObserved >= 14 && args.historicalMonths >= 2) return "high";
  if (args.daysObserved >= 7) return "medium";
  return "low";
}

export type CategoryTrend = {
  category: string;
  thisMonth: number;
  priorAverage: number;
  delta: number; // thisMonth - priorAverage
  deltaPct: number | null; // % change
};

export function categoryTrends(args: {
  entries: ExpenseEntry[];
  monthKey: MonthKey;
  lookback?: number;
}): CategoryTrend[] {
  const lookback = args.lookback ?? 3;
  const thisMonthByCat = new Map<string, number>();
  const priorByCat = new Map<string, { sum: number; months: Set<string> }>();

  for (const entry of args.entries) {
    const slice = sliceForMonth(entry, args.monthKey);
    if (slice) {
      thisMonthByCat.set(
        entry.category,
        (thisMonthByCat.get(entry.category) ?? 0) + slice.amount,
      );
    }
    for (let i = 1; i <= lookback; i++) {
      const prior = addMonths(args.monthKey, -i);
      const priorSlice = sliceForMonth(entry, prior);
      if (priorSlice) {
        const acc = priorByCat.get(entry.category) ?? {
          sum: 0,
          months: new Set<string>(),
        };
        acc.sum += priorSlice.amount;
        acc.months.add(prior);
        priorByCat.set(entry.category, acc);
      }
    }
  }

  const cats = new Set<string>([
    ...thisMonthByCat.keys(),
    ...priorByCat.keys(),
  ]);

  return Array.from(cats)
    .map((cat) => {
      const thisMonth = thisMonthByCat.get(cat) ?? 0;
      const priorEntry = priorByCat.get(cat);
      const priorMonths = priorEntry?.months.size ?? 0;
      const priorAverage =
        priorMonths > 0 ? (priorEntry?.sum ?? 0) / priorMonths : 0;
      const delta = thisMonth - priorAverage;
      const deltaPct =
        priorAverage > 0 ? (delta / priorAverage) * 100 : null;
      return { category: cat, thisMonth, priorAverage, delta, deltaPct };
    })
    .filter((t) => t.thisMonth > 0 || t.priorAverage > 0)
    .sort((a, b) => b.thisMonth - a.thisMonth);
}

export type DailyAllowance = {
  /** ₪ that can be spent today without breaching the budget. */
  allowance: number;
  /** What's already been spent today. */
  spentToday: number;
  /** Days remaining in the month including today. */
  daysRemaining: number;
  /** Currently allocated commitments (future installments + pending rules). */
  committedRemaining: number;
};

/**
 * Computes how much the user can spend today without going over budget,
 * accounting for slices that will charge later this month and recurring
 * rules that haven't paid out yet.
 */
export function dailyAllowance(args: {
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  monthlyBudget: number;
  monthKey: MonthKey;
  now?: Date;
}): DailyAllowance {
  const now = args.now ?? new Date();
  const totalDays = daysInMonth(args.monthKey);
  const dayOfMonth = now.getDate();
  const daysRemaining = Math.max(1, totalDays - dayOfMonth + 1);

  const proj = projectMonth({
    entries: args.entries,
    rules: args.rules,
    statuses: args.statuses,
    monthKey: args.monthKey,
    now,
  });

  let spentToday = 0;
  for (const entry of args.entries) {
    const slice = sliceForMonth(entry, args.monthKey);
    if (!slice) continue;
    if (slice.chargeDate.getDate() === dayOfMonth) {
      spentToday += slice.amount;
    }
  }

  const remainingBudget = args.monthlyBudget - proj.actual;
  const discretionary = Math.max(0, remainingBudget - proj.upcoming);
  const allowance = Math.max(0, discretionary / daysRemaining);

  return {
    allowance,
    spentToday,
    daysRemaining,
    committedRemaining: proj.upcoming,
  };
}

export function monthOverMonthTotals(args: {
  entries: ExpenseEntry[];
  monthKey: MonthKey;
  count?: number;
}): Array<{ monthKey: MonthKey; total: number; label: string }> {
  const count = args.count ?? 6;
  const out: Array<{ monthKey: MonthKey; total: number; label: string }> = [];
  for (let i = count - 1; i >= 0; i--) {
    const mk = addMonths(args.monthKey, -i);
    const total = totalSlicesForMonth(args.entries, mk);
    const [y, m] = mk.split("-").map(Number);
    const label = new Intl.DateTimeFormat("he-IL", {
      month: "short",
      year: "2-digit",
    }).format(dayWithinMonth(mk, 1));
    void y;
    void m;
    out.push({ monthKey: mk, total, label });
  }
  return out;
}
