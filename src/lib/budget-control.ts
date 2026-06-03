// Phase 322 — Budget Control breakdown.
//
// Single engine for the "כמה נשאר לי עד המשכורת" surface. Builds the
// full math the user sees in Settings → בקרת תקציב:
//
//     available =
//         bankBalance                      (can be negative)
//       + expectedIncomeUntilCycle
//       − pendingFixedUntilCycle
//       − pendingLoansUntilCycle
//       − pendingCardUntilCycle
//       − safetyBuffer
//
// No clamps on `available` — when the user is already projected into
// the minus, the engine returns a negative number and the UI surfaces
// it explicitly instead of pretending the budget is positive.
//
// Cycle end is the day before the next salary lands (within 35 days),
// falling back to today + 35 if no salary is scheduled. We piggy-back
// on liquidityCurve only for cycle-end detection; the breakdown
// itself walks the raw inputs so each line has a clear provenance.

import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import { liquidityCurve } from "@/lib/liquidity-curve";
import { buildStatusMap } from "@/lib/projections";
import { effectiveCashImpactStream } from "@/lib/effective-cash-date";
import { addMonths, monthKeyOf } from "@/lib/dates";
import { loanSchedule, ruleSchedule } from "@/lib/installment-schedule";
import { incomeForMonth } from "@/lib/income-month";

export type BudgetControlBreakdown = {
  cycleEndAt: string;
  nextSalaryAt: string | null;
  daysRemaining: number;
  bankBalance: number;
  expectedIncomeUntilCycle: number;
  pendingFixedUntilCycle: number;
  pendingLoansUntilCycle: number;
  pendingCardUntilCycle: number;
  safetyBuffer: number;
  /** Raw available — bank + income − everything pending − buffer.
   *  Not clamped; can be negative. */
  available: number;
  isNegative: boolean;
  /** True when the user has no active bank anchor — the bank line is
   *  unreliable and the UI should warn instead of showing a number. */
  hasAnchors: boolean;
  /** Active income headcount. Used by the UI to say "אין הכנסות מוגדרות"
   *  when zero. */
  hasIncomes: boolean;
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function pickCycleEnd(args: {
  points: { whenISO: string; dayIndex: number }[];
  salaryIso: string | null;
}): { whenISO: string; dayIndex: number } {
  if (!args.salaryIso) {
    const last = args.points[args.points.length - 1];
    return { whenISO: last.whenISO, dayIndex: last.dayIndex };
  }
  const target = args.salaryIso.slice(0, 10);
  for (let i = 0; i < args.points.length; i++) {
    if (args.points[i].whenISO.startsWith(target)) {
      const idx = Math.max(1, i - 1);
      return { whenISO: args.points[idx].whenISO, dayIndex: idx };
    }
  }
  const last = args.points[args.points.length - 1];
  return { whenISO: last.whenISO, dayIndex: last.dayIndex };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildBudgetControlBreakdown(args: {
  accounts: Account[];
  loans: Loan[];
  incomes: Income[];
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  safetyBuffer?: number;
  now?: Date;
}): BudgetControlBreakdown {
  const now = args.now ?? new Date();
  const today = startOfDay(now);
  const safetyBuffer = Math.max(0, args.safetyBuffer ?? 0);

  // Bank balance — sum every active bank anchor. Cards are excluded
  // (their pending charges land in `pendingCardUntilCycle`).
  let bankBalance = 0;
  let hasAnchors = false;
  for (const a of args.accounts) {
    if (!a.active) continue;
    if (a.kind !== "bank") continue;
    if (typeof a.anchorBalance !== "number") continue;
    bankBalance += a.anchorBalance;
    hasAnchors = true;
  }

  // Cycle horizon — use liquidityCurve only for salary detection.
  const curve = liquidityCurve({
    accounts: args.accounts,
    loans: args.loans,
    incomes: args.incomes,
    rules: args.rules,
    statuses: args.statuses,
    entries: args.entries,
    now,
    windowDays: 35,
  });
  const cycleEnd = pickCycleEnd({
    points: curve.points,
    salaryIso: curve.nextSalaryAt,
  });
  const cycleEndDate = new Date(cycleEnd.whenISO);
  const cycleEndDay = startOfDay(cycleEndDate);
  const daysRemaining = Math.max(
    1,
    Math.round(
      (cycleEndDay.getTime() - today.getTime()) / 86_400_000,
    ),
  );

  // Walk the day window once and accumulate per-source totals.
  let expectedIncome = 0;
  let pendingFixed = 0;
  let pendingLoans = 0;

  const monthKeyToday = monthKeyOf(now);
  const monthKeyNext = addMonths(monthKeyToday, 1);
  const statusMap = buildStatusMap(args.statuses);

  for (
    let d = new Date(today);
    d.getTime() <= cycleEndDay.getTime();
    d.setDate(d.getDate() + 1)
  ) {
    const dayNum = d.getDate();
    const isFirstDayOfWindow = d.getTime() === today.getTime();
    const monthKey =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth()
        ? monthKeyToday
        : monthKeyNext;

    // Incomes — count anything dropping today through the cycle end.
    // We include today itself (income that lands the same day still
    // funds the rest of the cycle).
    for (const inc of args.incomes) {
      if (!inc.active || inc.amount <= 0) continue;
      if (inc.dayOfMonth !== dayNum) continue;
      // Don't double-count: if it already landed earlier today the
      // bank anchor already reflects it. We can't tell from `Income`
      // alone, so treat any same-day income as still-to-come; the
      // user can refresh the anchor and the next cycle reflects it.
      void isFirstDayOfWindow;
      // Phase 335 — respect per-month override.
      expectedIncome += incomeForMonth(inc, monthKey);
    }

    // Recurring rules — pending only. A `paid` status this month
    // means the rule already hit the user's account → it's in the
    // anchor already.
    for (const rule of args.rules) {
      if (!rule.active) continue;
      if (rule.dayOfMonth !== dayNum) continue;
      const sched = ruleSchedule(rule, monthKey);
      if (!sched.active) continue;
      const status = statusMap.get(`${rule.id}|${monthKey}`);
      if (status?.status === "paid") continue;
      pendingFixed += rule.estimatedAmount;
    }

    // Loans — same dedup; if dayOfMonth already passed in the current
    // month the loan should have settled and the anchor reflects it.
    for (const loan of args.loans) {
      if (!loan.active) continue;
      if (loan.dayOfMonth !== dayNum) continue;
      const sched = loanSchedule(loan, monthKey);
      if (!sched.active) continue;
      pendingLoans += loan.monthlyInstallment;
    }
  }

  // Card / entry impacts — Phase 349 routes EVERY entry through
  // effectiveCashImpactStream so credit purchases land on the
  // card's billing day, not on the transaction day. A ₪59.90 buy
  // today on a card billed on the 2nd of next month now lives in
  // `pendingCard` until that 2nd; the user's bank anchor is not
  // touched twice. Cash entries still impact at chargeDate (the
  // stream resolves cash kind to immediate impact).
  let pendingCard = 0;
  const cycleEndMs = cycleEndDay.getTime() + 86_399_999;
  const todayMs = today.getTime();
  void monthKeyToday;
  void monthKeyNext;
  const cashImpacts = effectiveCashImpactStream({
    entries: args.entries,
    accounts: args.accounts,
    now,
  });
  for (const impact of cashImpacts) {
    if (impact.kind !== "card") continue;
    const ms = impact.effectiveCashDate.getTime();
    if (ms <= todayMs) continue;
    if (ms > cycleEndMs) continue;
    pendingCard += impact.amount;
  }
  // Future-dated CASH entries (Phase 336 forward-dated manual cash)
  // are not routed through `card` kind — count them as direct bank
  // pending impacts so the available math doesn't ignore them.
  for (const e of args.entries) {
    if (e.isRefund) continue;
    if (e.currency && e.currency !== "ILS") continue;
    if (e.excludeFromBudget) continue;
    if (e.paymentMethod !== "cash") continue;
    const iso = e.chargeDate ?? e.createdAt;
    if (!iso) continue;
    const ms = new Date(iso).getTime();
    if (!Number.isFinite(ms) || ms <= todayMs || ms > cycleEndMs) continue;
    pendingCard += Math.abs(e.amount);
  }

  const available =
    bankBalance +
    expectedIncome -
    pendingFixed -
    pendingLoans -
    pendingCard -
    safetyBuffer;

  return {
    cycleEndAt: cycleEnd.whenISO,
    nextSalaryAt: curve.nextSalaryAt,
    daysRemaining,
    bankBalance: round2(bankBalance),
    expectedIncomeUntilCycle: round2(expectedIncome),
    pendingFixedUntilCycle: round2(pendingFixed),
    pendingLoansUntilCycle: round2(pendingLoans),
    pendingCardUntilCycle: round2(pendingCard),
    safetyBuffer: round2(safetyBuffer),
    available: round2(available),
    isNegative: available < 0,
    hasAnchors,
    hasIncomes: args.incomes.some((i) => i.active && i.amount > 0),
  };
}

/** Used by callers that just need the headline number. Returns null
 *  when the user has no anchors set — the result would be unreliable. */
export function budgetControlAvailable(
  breakdown: BudgetControlBreakdown,
): number | null {
  if (!breakdown.hasAnchors) return null;
  return breakdown.available;
}

const ILS_LABEL = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const DAY_LABEL = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "long",
});

/** Phase 331 — single-sentence forecast for the simplified Settings
 *  control. Always describes the bottom line in plain Hebrew so the
 *  user never has to read a table to know if they're OK. */
export function buildBudgetSentence(args: {
  breakdown: BudgetControlBreakdown;
  /** Optional projected end-of-period balance from
   *  buildFinancialSnapshot — when present it overrides the raw
   *  cycle math with a pace-aware forecast. */
  projectedEndOfMonth?: number;
}): string {
  const { breakdown } = args;
  if (!breakdown.hasAnchors) {
    return "חסר חשבון בנק עם יתרה — Pulse יחשב ברגע שתגדיר.";
  }
  const cycleEnd = new Date(breakdown.cycleEndAt);
  const cycleLabel = Number.isNaN(cycleEnd.getTime())
    ? "סוף המחזור"
    : DAY_LABEL.format(cycleEnd);

  if (breakdown.available < 0) {
    return `יש חריגה צפויה של ${ILS_LABEL.format(Math.round(Math.abs(breakdown.available)))} עד ${cycleLabel}.`;
  }
  if (
    args.projectedEndOfMonth !== undefined &&
    args.projectedEndOfMonth < 0
  ) {
    return `אם תמשיך בקצב הנוכחי, תסיים את החודש סביב ${ILS_LABEL.format(Math.round(args.projectedEndOfMonth))}.`;
  }
  if (
    args.projectedEndOfMonth !== undefined &&
    args.projectedEndOfMonth < 1000
  ) {
    return `אם תמשיך בקצב הנוכחי, תסיים את החודש סביב ${ILS_LABEL.format(Math.round(args.projectedEndOfMonth))}.`;
  }
  return `תסיים את התקופה עם ${ILS_LABEL.format(Math.round(breakdown.available))} פנויים.`;
}
