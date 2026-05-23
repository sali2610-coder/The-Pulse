// Forecast timeline — flat ordered list of upcoming financial events
// for the remainder of the current month. Single source for the
// "ForecastTimelineCard" so the user sees:
//   * incoming salary
//   * loan installments
//   * recurring rules
//   * future card-slice charges (installment plans + entries
//     already scheduled later this month)
//
// Pure compute. No new math — every event sources from the same
// rules/loans/incomes/entries the rest of the dashboard reads.

import type {
  ExpenseEntry,
  Income,
  Loan,
  MonthKey,
  RecurringRule,
} from "@/types/finance";
import { monthKeyOf, dayWithinMonth } from "@/lib/dates";
import { ruleSchedule } from "@/lib/installment-schedule";
import { sliceForMonth } from "@/lib/projections";

export type ForecastTimelineKind =
  | "salary"
  | "loan"
  | "recurring"
  | "card_slice"
  | "installment_plan";

export type ForecastEvent = {
  id: string;
  kind: ForecastTimelineKind;
  /** Day-of-month (1..31). */
  day: number;
  /** ISO timestamp for the event, set to noon local on `day`. */
  whenISO: string;
  /** Signed amount — positive for inflows, negative for outflows. */
  amount: number;
  /** Hebrew display label rendered verbatim. */
  label: string;
  /** Short Hebrew note rendered as a sub-line. */
  meta?: string;
};

export function forecastTimeline(args: {
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  loans: Loan[];
  incomes: Income[];
  monthKey?: MonthKey;
  now?: Date;
}): ForecastEvent[] {
  const now = args.now ?? new Date();
  const monthKey: MonthKey = args.monthKey ?? monthKeyOf(now);
  const today = monthKeyOf(now) === monthKey ? now.getDate() : 1;
  const events: ForecastEvent[] = [];

  // 1. Salary inflow — incomes whose dayOfMonth >= today.
  for (const inc of args.incomes) {
    if (!inc.active) continue;
    if (inc.amount <= 0) continue;
    if (inc.dayOfMonth < today) continue;
    events.push({
      id: `salary:${inc.id}`,
      kind: "salary",
      day: inc.dayOfMonth,
      whenISO: dayWithinMonth(monthKey, inc.dayOfMonth).toISOString(),
      amount: inc.amount,
      label: inc.label,
      meta: "הכנסה צפויה",
    });
  }

  // 2. Loan installments — dayOfMonth >= today.
  for (const loan of args.loans) {
    if (!loan.active) continue;
    if (loan.dayOfMonth < today) continue;
    events.push({
      id: `loan:${loan.id}`,
      kind: "loan",
      day: loan.dayOfMonth,
      whenISO: dayWithinMonth(monthKey, loan.dayOfMonth).toISOString(),
      amount: -loan.monthlyInstallment,
      label: loan.label,
      meta: "תשלום הלוואה",
    });
  }

  // 3. Recurring rules — active, in-month, not already paid, day >= today.
  // We don't check statuses here because we want EVERY upcoming charge
  // — even ones the user might have already paid show what's expected.
  for (const rule of args.rules) {
    if (!rule.active) continue;
    if (!ruleSchedule(rule, monthKey).active) continue;
    if (rule.dayOfMonth < today) continue;
    events.push({
      id: `rule:${rule.id}`,
      kind: "recurring",
      day: rule.dayOfMonth,
      whenISO: dayWithinMonth(monthKey, rule.dayOfMonth).toISOString(),
      amount: -rule.estimatedAmount,
      label: rule.label,
      meta: rule.installmentTotal ? "פלאן תשלומים" : "הוצאה קבועה",
    });
  }

  // 4. Future-scheduled entry slices in this month (one-shot card
  //    charges + installment slices not yet posted).
  for (const e of args.entries) {
    if (e.needsConfirmation) continue;
    if (e.bankPending) continue;
    if (e.excludeFromBudget) continue;
    if (e.isRefund) continue;
    if (e.currency && e.currency !== "ILS") continue;
    const slice = sliceForMonth(e, monthKey);
    if (!slice) continue;
    if (slice.chargeDate.getTime() <= now.getTime()) continue;
    events.push({
      id: `slice:${e.id}:${monthKey}`,
      kind: e.installments > 1 ? "installment_plan" : "card_slice",
      day: slice.chargeDate.getDate(),
      whenISO: slice.chargeDate.toISOString(),
      amount: -slice.amount,
      label: e.merchant ?? e.note ?? "חיוב כרטיס",
      meta:
        e.installments > 1
          ? `תשלום מתוך ${e.installments}`
          : "חיוב מתוזמן",
    });
  }

  // Ordered by day then signed by inflow first within the day.
  events.sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day;
    return b.amount - a.amount;
  });
  return events;
}
