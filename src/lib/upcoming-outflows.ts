// Forward-looking outflow digest.
//
// Aggregates the next-7-day money-going-out picture: expense slices
// landing within the window, recurring rules whose dayOfMonth hits
// the window and are still pending, and active loans whose
// installment day falls in the window. Pure compute — no mutation,
// no persistence.

import type {
  ExpenseEntry,
  Loan,
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import { sliceForMonth, buildStatusMap } from "@/lib/projections";
import {
  monthKeyOf,
  addMonths,
  dayWithinMonth,
} from "@/lib/dates";
import { loanSchedule, ruleSchedule } from "@/lib/installment-schedule";

export type OutflowKind = "entry" | "rule" | "loan";

export type UpcomingOutflow = {
  kind: OutflowKind;
  id: string;
  label: string;
  amount: number;
  /** Expected charge date inside the window. */
  date: Date;
  /** Days from `now`. 0 = today, 1 = tomorrow. */
  daysUntil: number;
};

function pushIfInWindow(
  out: UpcomingOutflow[],
  candidate: UpcomingOutflow,
  startMs: number,
  endMs: number,
) {
  const ms = candidate.date.getTime();
  if (ms < startMs || ms > endMs) return;
  out.push(candidate);
}

export function upcomingOutflows(args: {
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  loans: Loan[];
  now?: Date;
  horizonDays?: number;
}): UpcomingOutflow[] {
  const now = args.now ?? new Date();
  const horizon = args.horizonDays ?? 7;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setDate(end.getDate() + horizon);
  end.setHours(23, 59, 59, 999);
  const startMs = start.getTime();
  const endMs = end.getTime();
  const dayMs = 86_400_000;

  const out: UpcomingOutflow[] = [];

  // Months the window touches — typically 1 or 2.
  const monthKeys = new Set<MonthKey>();
  monthKeys.add(monthKeyOf(start));
  monthKeys.add(monthKeyOf(end));

  // Entry slices.
  for (const e of args.entries) {
    if (e.isRefund) continue;
    if (e.bankPending) continue;
    if (e.needsConfirmation) continue;
    if (e.excludeFromBudget) continue;
    for (const mk of monthKeys) {
      const slice = sliceForMonth(e, mk);
      if (!slice) continue;
      const daysUntil = Math.max(
        0,
        Math.floor((slice.chargeDate.getTime() - startMs) / dayMs),
      );
      pushIfInWindow(
        out,
        {
          kind: "entry",
          id: `e:${e.id}:${mk}`,
          label: e.merchant ?? e.note ?? "חיוב",
          amount: slice.amount,
          date: slice.chargeDate,
          daysUntil,
        },
        startMs,
        endMs,
      );
      break;
    }
  }

  // Recurring rules — still pending in the relevant month + dayOfMonth
  // lands inside the window.
  const statusMap = buildStatusMap(args.statuses);
  for (const rule of args.rules) {
    if (!rule.active) continue;
    for (const mk of monthKeys) {
      const sched = ruleSchedule(rule, mk);
      if (!sched.active) continue;
      const status = statusMap.get(`${rule.id}__${mk}`);
      if (status?.status === "paid") continue;
      const date = dayWithinMonth(mk, rule.dayOfMonth);
      const daysUntil = Math.max(
        0,
        Math.floor((date.getTime() - startMs) / dayMs),
      );
      pushIfInWindow(
        out,
        {
          kind: "rule",
          id: `r:${rule.id}:${mk}`,
          label: rule.label,
          amount: rule.estimatedAmount,
          date,
          daysUntil,
        },
        startMs,
        endMs,
      );
    }
  }

  // Loans — schedule-active in the relevant month, dayOfMonth in window.
  for (const loan of args.loans) {
    if (!loan.active) continue;
    for (const mk of monthKeys) {
      const sched = loanSchedule(loan, mk);
      if (!sched.active) continue;
      const date = dayWithinMonth(mk, loan.dayOfMonth);
      const daysUntil = Math.max(
        0,
        Math.floor((date.getTime() - startMs) / dayMs),
      );
      pushIfInWindow(
        out,
        {
          kind: "loan",
          id: `l:${loan.id}:${mk}`,
          label: loan.label,
          amount: loan.monthlyInstallment,
          date,
          daysUntil,
        },
        startMs,
        endMs,
      );
    }
  }

  out.sort((a, b) => a.date.getTime() - b.date.getTime());
  return out;
}

// Re-export so consumers can do month math without juggling imports.
export { addMonths };
