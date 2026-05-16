import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
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

// ────────────────────────────────────────────────────────────────────────────
// CFO Brain — multi-account end-of-month projection.
// ────────────────────────────────────────────────────────────────────────────

export type EndOfMonthForecast = {
  /** Σ active bank-account anchors (live balances, may be negative). */
  totalAnchors: number;
  /** Σ active incomes whose dayOfMonth >= today (still expected this month). */
  expectedIncome: number;
  /** Σ unpaid recurring rules this month (expected outflows). */
  pendingFixed: number;
  /** Σ active loan installments whose dayOfMonth >= today. */
  pendingLoans: number;
  /** Σ entry slices in this month with chargeDate > today (future card debits). */
  futureCardSlices: number;
  /** Final estimate: anchors + income − fixed − loans − futureCardSlices. */
  forecast: number;
  /** Forecast vs zero — useful as a "in the red?" indicator. */
  variance: number;
};

function loanIsActiveInMonth(loan: Loan, monthKey: MonthKey): boolean {
  if (!loan.active) return false;
  if (loan.remainingBalance <= 0) return false;
  if (!loan.endDate) return true;
  // The loan still bills this month if endDate >= the 1st of the month.
  const endTime = new Date(loan.endDate).getTime();
  if (Number.isNaN(endTime)) return true;
  const [y, m] = monthKey.split("-").map(Number);
  const firstOfMonthTime = new Date(y, m - 1, 1).getTime();
  return endTime >= firstOfMonthTime;
}

export function forecastEndOfMonth(args: {
  accounts: Account[];
  loans: Loan[];
  incomes: Income[];
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  monthKey: MonthKey;
  now?: Date;
}): EndOfMonthForecast {
  const now = args.now ?? new Date();
  const isCurrentMonth = monthKeyOf(now) === args.monthKey;
  const dayOfMonth = isCurrentMonth ? now.getDate() : 1;
  const startOfMonthForecast = !isCurrentMonth || dayOfMonth <= 1;

  // 1. Total anchors across all active bank accounts.
  const totalAnchors = args.accounts
    .filter((a) => a.active && a.kind === "bank" && a.anchorBalance !== undefined)
    .reduce((sum, a) => sum + (a.anchorBalance ?? 0), 0);

  // 2. Future income — incomes whose day hasn't arrived yet this month.
  const expectedIncome = args.incomes
    .filter(
      (i) =>
        i.active &&
        (startOfMonthForecast || i.dayOfMonth >= dayOfMonth),
    )
    .reduce((sum, i) => sum + i.amount, 0);

  // 3. Pending fixed expenses — active rules whose status is not "paid".
  const statusKey = (ruleId: string) => `${ruleId}__${args.monthKey}`;
  const paidThisMonth = new Set(
    args.statuses
      .filter((s) => s.monthKey === args.monthKey && s.status === "paid")
      .map((s) => statusKey(s.ruleId)),
  );
  const pendingFixed = args.rules
    .filter((r) => r.active && !paidThisMonth.has(statusKey(r.id)))
    .reduce((sum, r) => sum + r.estimatedAmount, 0);

  // 4. Pending loan installments still due this month.
  const pendingLoans = args.loans
    .filter(
      (l) =>
        loanIsActiveInMonth(l, args.monthKey) &&
        (startOfMonthForecast || l.dayOfMonth >= dayOfMonth),
    )
    .reduce((sum, l) => sum + l.monthlyInstallment, 0);

  // 5. Future card slices — entry slices in this month not yet posted.
  let futureCardSlices = 0;
  for (const entry of args.entries) {
    // Skip user-side pending (Wallet partial awaiting confirm) and
    // bank-side pending (charge not finalized) — both would distort the
    // forecast and double-count when richer data eventually arrives.
    if (entry.needsConfirmation) continue;
    if (entry.bankPending) continue;
    const slice = sliceForMonth(entry, args.monthKey);
    if (!slice) continue;
    if (entry.isRefund) continue; // refunds don't deplete forecast
    if (entry.currency && entry.currency !== "ILS") continue;
    if (!startOfMonthForecast && slice.chargeDate.getTime() <= now.getTime()) {
      // Already charged — already reflected in the bank anchor (in theory).
      continue;
    }
    futureCardSlices += slice.amount;
  }

  const forecast =
    totalAnchors + expectedIncome - pendingFixed - pendingLoans - futureCardSlices;
  const variance = forecast; // negative = ending the month in the red

  return {
    totalAnchors,
    expectedIncome,
    pendingFixed,
    pendingLoans,
    futureCardSlices,
    forecast,
    variance,
  };
}


// ────────────────────────────────────────────────────────────────────────────
// Daily balance timeline — projects how the active-bank-account balance will
// evolve day-by-day for the remainder of the month, so the dashboard can
// show overdraft warnings, a balance sparkline, and the day on which the
// account would first dip below zero.
// ────────────────────────────────────────────────────────────────────────────

export type BalancePoint = {
  /** Day of the month (1..daysInMonth). */
  day: number;
  /** Running balance at end-of-day. May be negative. */
  balance: number;
};

export type BalanceTimeline = {
  /** Per-day projected balance from the starting day onward. */
  points: BalancePoint[];
  /** Day the timeline starts at — today for the current month, 1 otherwise. */
  startDay: number;
  /** Bank-anchor sum at the timeline's first point. */
  startBalance: number;
  /** Projected balance on the last day of the month. */
  endBalance: number;
  /** Day with the lowest projected balance (post-anchor). */
  lowestDay: number;
  /** Lowest projected balance value across the timeline. */
  lowestBalance: number;
  /** First day balance is projected to dip below zero (undefined if never). */
  overdraftDay?: number;
  /** True if at least one point in the timeline is < 0. */
  goesNegative: boolean;
};

export function forecastBalanceTimeline(args: {
  accounts: Account[];
  loans: Loan[];
  incomes: Income[];
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  monthKey: MonthKey;
  now?: Date;
}): BalanceTimeline {
  const now = args.now ?? new Date();
  const isCurrentMonth = monthKeyOf(now) === args.monthKey;
  const totalDays = daysInMonth(args.monthKey);
  const startDay = isCurrentMonth ? Math.min(now.getDate(), totalDays) : 1;

  const totalAnchors = args.accounts
    .filter((a) => a.active && a.kind === "bank" && a.anchorBalance !== undefined)
    .reduce((sum, a) => sum + (a.anchorBalance ?? 0), 0);

  // Build a per-day delta map (income positive, outflows negative).
  const dailyDelta = new Array<number>(totalDays + 1).fill(0);

  // Helper — only count obligations on `day >= startDay` to avoid double
  // counting events the bank anchor already reflects.
  const enqueue = (day: number, delta: number) => {
    if (!Number.isFinite(day) || day < startDay || day > totalDays) return;
    dailyDelta[day] += delta;
  };

  // Incomes
  for (const inc of args.incomes) {
    if (!inc.active) continue;
    enqueue(inc.dayOfMonth, inc.amount);
  }

  // Loan installments
  for (const loan of args.loans) {
    if (!loanIsActiveInMonth(loan, args.monthKey)) continue;
    enqueue(loan.dayOfMonth, -loan.monthlyInstallment);
  }

  // Recurring rules still unpaid this month
  const paidIds = new Set(
    args.statuses
      .filter((s) => s.monthKey === args.monthKey && s.status === "paid")
      .map((s) => s.ruleId),
  );
  for (const rule of args.rules) {
    if (!rule.active) continue;
    if (paidIds.has(rule.id)) continue;
    enqueue(rule.dayOfMonth, -rule.estimatedAmount);
  }

  // Entry slices — future charges only
  for (const entry of args.entries) {
    if (entry.needsConfirmation) continue;
    if (entry.bankPending) continue;
    if (entry.isRefund) continue;
    if (entry.currency && entry.currency !== "ILS") continue;
    const slice = sliceForMonth(entry, args.monthKey);
    if (!slice) continue;
    enqueue(slice.chargeDate.getDate(), -slice.amount);
  }

  // Walk the days, accumulating into a running balance.
  const points: BalancePoint[] = [];
  let balance = totalAnchors;
  let lowestDay = startDay;
  let lowestBalance = balance;
  let overdraftDay: number | undefined;
  let goesNegative = balance < 0;

  for (let day = startDay; day <= totalDays; day++) {
    balance += dailyDelta[day];
    points.push({ day, balance });
    if (balance < lowestBalance) {
      lowestBalance = balance;
      lowestDay = day;
    }
    if (balance < 0 && overdraftDay === undefined) {
      overdraftDay = day;
    }
    if (balance < 0) goesNegative = true;
  }

  const endBalance = points.length > 0 ? points[points.length - 1].balance : totalAnchors;

  return {
    points,
    startDay,
    startBalance: totalAnchors,
    endBalance,
    lowestDay,
    lowestBalance,
    overdraftDay,
    goesNegative,
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
