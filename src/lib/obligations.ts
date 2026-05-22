// Obligations engine.
//
// Pure compute. Aggregates every committed monthly outflow + income
// into per-day and per-month projections so the UI can answer:
//   "What hits this card on the 12th?"
//   "How much do I have to commit in March 2027?"
//   "How much can I safely spend today?"
//
// No React. No store. Consumes the same primitives the dashboard
// projections + forecast modules use, so all numbers are consistent
// across the bento.

import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import { addMonths, monthKeyOf } from "@/lib/dates";
import { daysInMonth, sliceForMonth } from "@/lib/projections";
import { loanSchedule, ruleSchedule } from "@/lib/installment-schedule";

export type ObligationKind =
  | "recurring"
  | "installment-plan"
  | "loan"
  | "income"
  | "card-cycle"
  | "entry-slice";

export type ObligationItem = {
  date: Date;
  dayOfMonth: number;
  kind: ObligationKind;
  label: string;
  amount: number; // signed — positive = outflow, negative = inflow
  accountId?: string;
  sourceId: string; // rule.id / loan.id / income.id / entry.id
  status?: "pending" | "paid";
};

function dayDate(year: number, monthIdx0: number, day: number): Date {
  const last = daysInMonth(`${year}-${String(monthIdx0 + 1).padStart(2, "0")}`);
  const d = Math.min(Math.max(1, day), last);
  return new Date(year, monthIdx0, d, 12, 0, 0);
}

export type MonthObligationsArgs = {
  rules: RecurringRule[];
  loans: Loan[];
  incomes: Income[];
  entries: ExpenseEntry[];
  statuses: RecurringStatus[];
  monthKey: MonthKey;
};

/** Every committed line that hits the given month, sorted by date.
 *  Outflows are positive amounts, incomes are negative. Card entries
 *  with matched rule statuses are NOT duplicated — the rule statuses
 *  already point at the entry. */
export function monthObligations(args: MonthObligationsArgs): ObligationItem[] {
  const [yearStr, monthStr] = args.monthKey.split("-");
  const year = Number(yearStr);
  const monthIdx0 = Number(monthStr) - 1;
  const out: ObligationItem[] = [];

  const paidIds = new Set(
    args.statuses
      .filter((s) => s.monthKey === args.monthKey && s.status === "paid")
      .map((s) => s.ruleId),
  );

  // Recurring rules + installment plans.
  for (const rule of args.rules) {
    if (!rule.active) continue;
    const sched = ruleSchedule(rule, args.monthKey);
    if (!sched.active) continue;
    const isInstallment = Boolean(rule.installmentTotal);
    const date = dayDate(year, monthIdx0, rule.dayOfMonth);
    out.push({
      date,
      dayOfMonth: date.getDate(),
      kind: isInstallment ? "installment-plan" : "recurring",
      label: rule.label,
      amount: rule.estimatedAmount,
      accountId:
        rule.paymentSource === "card" ? rule.linkedCardId : undefined,
      sourceId: rule.id,
      status: paidIds.has(rule.id) ? "paid" : "pending",
    });
  }

  // Loans.
  for (const loan of args.loans) {
    if (!loan.active) continue;
    const sched = loanSchedule(loan, args.monthKey);
    if (!sched.active) continue;
    const date = dayDate(year, monthIdx0, loan.dayOfMonth);
    out.push({
      date,
      dayOfMonth: date.getDate(),
      kind: "loan",
      label: loan.label,
      amount: loan.monthlyInstallment,
      sourceId: loan.id,
    });
  }

  // Incomes (signed negative — inflow).
  for (const inc of args.incomes) {
    if (!inc.active) continue;
    const date = dayDate(year, monthIdx0, inc.dayOfMonth);
    out.push({
      date,
      dayOfMonth: date.getDate(),
      kind: "income",
      label: inc.label,
      amount: -inc.amount,
      sourceId: inc.id,
    });
  }

  // Entry slices firing this month — only ENTRIES that don't already
  // belong to a matched-rule (avoid double counting).
  const matchedEntryIds = new Set(
    args.statuses
      .filter((s) => s.monthKey === args.monthKey && s.matchedExpenseId)
      .map((s) => s.matchedExpenseId as string),
  );
  for (const entry of args.entries) {
    if (entry.isRefund) continue;
    if (entry.needsConfirmation) continue;
    if (entry.bankPending) continue;
    if (entry.excludeFromBudget) continue;
    if (matchedEntryIds.has(entry.id)) continue;
    const slice = sliceForMonth(entry, args.monthKey);
    if (!slice) continue;
    out.push({
      date: slice.chargeDate,
      dayOfMonth: slice.chargeDate.getDate(),
      kind: "entry-slice",
      label: entry.merchant ?? entry.note ?? entry.category,
      amount: slice.amount,
      accountId: entry.accountId,
      sourceId: entry.id,
    });
  }

  out.sort((a, b) => a.date.getTime() - b.date.getTime());
  return out;
}

export type MonthSummary = {
  monthKey: MonthKey;
  income: number;
  fixed: number; // recurring + installment plans firing this month
  loans: number;
  cardEntries: number; // slices from already-existing entries
  outflow: number; // fixed + loans + cardEntries
  net: number; // income - outflow
};

/** Summary for one month built from the obligation list. */
export function summarizeMonth(items: ObligationItem[], monthKey: MonthKey): MonthSummary {
  let income = 0;
  let fixed = 0;
  let loans = 0;
  let cardEntries = 0;
  for (const it of items) {
    if (it.kind === "income") {
      income += -it.amount; // negative → positive total
    } else if (it.kind === "loan") {
      loans += it.amount;
    } else if (it.kind === "entry-slice") {
      cardEntries += it.amount;
    } else {
      // recurring + installment-plan
      fixed += it.amount;
    }
  }
  const outflow = fixed + loans + cardEntries;
  return {
    monthKey,
    income,
    fixed,
    loans,
    cardEntries,
    outflow,
    net: income - outflow,
  };
}

export type TimelineArgs = {
  rules: RecurringRule[];
  loans: Loan[];
  incomes: Income[];
  entries: ExpenseEntry[];
  statuses: RecurringStatus[];
  /** First month to project from. Defaults to the current month. */
  startMonth?: MonthKey;
  /** How many months to project (including the start month). */
  months: number;
};

/** Multi-month obligations timeline. The first month uses the live
 *  obligation list (entries + rules + loans + incomes); subsequent
 *  months use only the forward-projecting primitives (rules + loans
 *  + incomes) — entries don't extend beyond their installment count
 *  which sliceForMonth already handles. */
export function obligationsTimeline(args: TimelineArgs): MonthSummary[] {
  const start = args.startMonth ?? monthKeyOf(new Date());
  const out: MonthSummary[] = [];
  for (let i = 0; i < args.months; i++) {
    const key = addMonths(start, i);
    const items = monthObligations({
      rules: args.rules,
      loans: args.loans,
      incomes: args.incomes,
      entries: args.entries,
      statuses: args.statuses,
      monthKey: key,
    });
    out.push(summarizeMonth(items, key));
  }
  return out;
}

// ── Safe-to-spend ────────────────────────────────────────────────────
// Derives an honest "this is how much you can spend in the remaining
// days without breaking the month" number from the current forecast
// inputs. Separate from `dailyAllowance` in forecast.ts because that
// one focuses on TODAY; safeToSpend gives a per-day average over the
// remaining horizon AND the absolute amount still on the table.

export type SafeToSpend = {
  /** Absolute amount the user could still spend this month before
   *  the forecast goes negative (or below `minCushion` if supplied). */
  totalRemaining: number;
  /** Average daily target across `daysRemaining`. */
  perDay: number;
  daysRemaining: number;
  /** True when the user is already in the red — UI should show a
   *  warning band instead of a happy number. */
  overBudget: boolean;
};

export function safeToSpend(args: {
  accounts: Account[];
  loans: Loan[];
  incomes: Income[];
  rules: RecurringRule[];
  entries: ExpenseEntry[];
  statuses: RecurringStatus[];
  monthlyBudget: number;
  monthKey: MonthKey;
  now?: Date;
  /** Reserve this many ILS at month-end so the user never lands on
   *  zero — defaults to 0. */
  minCushion?: number;
}): SafeToSpend {
  const now = args.now ?? new Date();
  const isCurrent = monthKeyOf(now) === args.monthKey;
  const last = daysInMonth(args.monthKey);
  const day = isCurrent ? now.getDate() : 1;
  const daysRemaining = Math.max(1, last - day + 1);

  // Use the same primitives forecastEndOfMonth uses — derive ourselves
  // to avoid a circular import (forecast.ts → obligations would also
  // pull projections, which is fine, but obligations is the lower
  // layer here).
  const paidIds = new Set(
    args.statuses
      .filter((s) => s.monthKey === args.monthKey && s.status === "paid")
      .map((s) => s.ruleId),
  );

  let pendingFixed = 0;
  for (const rule of args.rules) {
    if (!rule.active) continue;
    if (paidIds.has(rule.id)) continue;
    if (!ruleSchedule(rule, args.monthKey).active) continue;
    pendingFixed += rule.estimatedAmount;
  }

  let pendingLoans = 0;
  for (const loan of args.loans) {
    if (!loan.active) continue;
    if (!loanSchedule(loan, args.monthKey).active) continue;
    if (isCurrent && loan.dayOfMonth < day) continue;
    pendingLoans += loan.monthlyInstallment;
  }

  let expectedIncome = 0;
  for (const inc of args.incomes) {
    if (!inc.active) continue;
    if (isCurrent && inc.dayOfMonth < day) continue;
    expectedIncome += inc.amount;
  }

  let totalAnchors = 0;
  for (const a of args.accounts) {
    if (!a.active) continue;
    if (a.kind !== "bank") continue;
    totalAnchors += a.anchorBalance ?? 0;
  }

  let futureCardSlices = 0;
  for (const entry of args.entries) {
    if (entry.isRefund) continue;
    if (entry.needsConfirmation) continue;
    if (entry.bankPending) continue;
    if (entry.excludeFromBudget) continue;
    const slice = sliceForMonth(entry, args.monthKey);
    if (!slice) continue;
    if (isCurrent && slice.chargeDate.getTime() <= now.getTime()) continue;
    futureCardSlices += slice.amount;
  }

  const cushion = args.minCushion ?? 0;
  const headroom =
    totalAnchors +
    expectedIncome -
    pendingFixed -
    pendingLoans -
    futureCardSlices -
    cushion;

  // Budget cap — if the user has set a monthly budget, also constrain
  // by remaining budget for the month (cheapest envelope).
  let budgetCap = Number.POSITIVE_INFINITY;
  if (args.monthlyBudget > 0) {
    // Best-effort: subtract entries that already landed this month.
    let spentSoFar = 0;
    for (const entry of args.entries) {
      if (entry.isRefund) continue;
      if (entry.excludeFromBudget) continue;
      const slice = sliceForMonth(entry, args.monthKey);
      if (!slice) continue;
      if (isCurrent && slice.chargeDate.getTime() > now.getTime()) continue;
      spentSoFar += slice.amount;
    }
    budgetCap = Math.max(0, args.monthlyBudget - spentSoFar - pendingFixed);
  }

  const totalRemaining = Math.min(headroom, budgetCap);
  return {
    totalRemaining,
    perDay: totalRemaining / daysRemaining,
    daysRemaining,
    overBudget: totalRemaining < 0,
  };
}
