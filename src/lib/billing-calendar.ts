// Billing calendar — month-grid view of recurring outflows.
//
// For each day of `monthKey`, aggregates active rules + loans whose
// dayOfMonth fires that day. Day-of-month is clamped to the actual
// month length so a `dayOfMonth: 31` rule fires on Feb 28/29 in
// February, etc.
//
// Pure compute. Doesn't include ad-hoc ExpenseEntry slices — those
// land in UpcomingOutflowsCard. This view is specifically the
// COMMITTED recurring picture for a month.

import type {
  Loan,
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import { buildStatusMap, daysInMonth } from "@/lib/projections";
import { loanSchedule, ruleSchedule } from "@/lib/installment-schedule";

export type BillingCalendarItem = {
  kind: "rule" | "loan";
  id: string;
  label: string;
  amount: number;
  /** Rule statuses come in pending|paid. Loans are always considered
   *  pending until the user wires SMS matching for them. */
  status: "pending" | "paid";
};

export type BillingCalendarDay = {
  day: number;
  total: number;
  items: BillingCalendarItem[];
};

export function buildBillingCalendar(args: {
  rules: RecurringRule[];
  loans: Loan[];
  statuses: RecurringStatus[];
  monthKey: MonthKey;
}): BillingCalendarDay[] {
  const len = daysInMonth(args.monthKey);
  const statusMap = buildStatusMap(args.statuses);
  const days: BillingCalendarDay[] = Array.from({ length: len }, (_, i) => ({
    day: i + 1,
    total: 0,
    items: [],
  }));

  const clamp = (d: number) => Math.min(Math.max(1, Math.floor(d)), len);

  for (const rule of args.rules) {
    if (!rule.active) continue;
    const sched = ruleSchedule(rule, args.monthKey);
    if (!sched.active) continue;
    const day = clamp(rule.dayOfMonth);
    const status =
      statusMap.get(`${rule.id}__${args.monthKey}`)?.status === "paid"
        ? "paid"
        : "pending";
    days[day - 1].items.push({
      kind: "rule",
      id: rule.id,
      label: rule.label,
      amount: rule.estimatedAmount,
      status,
    });
    days[day - 1].total += rule.estimatedAmount;
  }

  for (const loan of args.loans) {
    if (!loan.active) continue;
    const sched = loanSchedule(loan, args.monthKey);
    if (!sched.active) continue;
    const day = clamp(loan.dayOfMonth);
    days[day - 1].items.push({
      kind: "loan",
      id: loan.id,
      label: loan.label,
      amount: loan.monthlyInstallment,
      status: "pending",
    });
    days[day - 1].total += loan.monthlyInstallment;
  }

  return days;
}
