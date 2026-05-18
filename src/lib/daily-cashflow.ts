// Pure data shaper — per-day cash-flow series for the current month.
//
// One function, one shape. Each entry in the returned array describes
// what happens on a single day of the projected month:
//   - inflows: incomes scheduled on that day
//   - outflows: charges, recurring obligations, loan installments, BNPL
//                slices
//   - runningBalance: cumulative balance starting from the bank anchor
//
// Consumers (the upcoming daily-drill-down sheet, the heatmap card) read
// from this without re-deriving math from accounts/loans/incomes/entries.
// Same data, one shape, no drift.

import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";

import { sliceForMonth } from "@/lib/projections";
import { monthKeyOf } from "@/lib/dates";
import { loanSchedule, ruleSchedule } from "@/lib/installment-schedule";

export type DailyMovement = {
  day: number; // 1..31
  date: Date;
  isToday: boolean;
  isPast: boolean;
  inflows: number;
  outflows: number;
  net: number;
  runningBalance: number;
  /** Short Hebrew descriptors of what hits this day, ordered by impact. */
  events: Array<{
    label: string;
    amount: number; // positive = inflow, negative = outflow
    kind: "income" | "rule" | "loan" | "card" | "installment";
  }>;
};

export type DailyCashflow = {
  monthKey: MonthKey;
  startBalance: number;
  endBalance: number;
  days: DailyMovement[];
};

function daysInMonth(monthKey: MonthKey): number {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function dateOf(monthKey: MonthKey, day: number): Date {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, day);
}

export function buildDailyCashflow(args: {
  accounts: Account[];
  loans: Loan[];
  incomes: Income[];
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  monthKey: MonthKey;
  now?: Date;
}): DailyCashflow {
  const now = args.now ?? new Date();
  const monthKey = args.monthKey;
  const totalDays = daysInMonth(monthKey);
  const isCurrentMonth = monthKeyOf(now) === monthKey;
  const todayDay = isCurrentMonth ? now.getDate() : -1;

  const startBalance = args.accounts
    .filter(
      (a) =>
        a.active && a.kind === "bank" && a.anchorBalance !== undefined,
    )
    .reduce((sum, a) => sum + (a.anchorBalance ?? 0), 0);

  const paidThisMonth = new Set(
    args.statuses
      .filter((s) => s.monthKey === monthKey && s.status === "paid")
      .map((s) => s.ruleId),
  );

  const days: DailyMovement[] = [];
  let running = startBalance;

  for (let day = 1; day <= totalDays; day++) {
    const dayDate = dateOf(monthKey, day);
    const events: DailyMovement["events"] = [];
    let inflows = 0;
    let outflows = 0;

    // Income on this day.
    for (const income of args.incomes) {
      if (!income.active) continue;
      if (income.dayOfMonth !== day) continue;
      inflows += income.amount;
      events.push({
        label: income.label,
        amount: income.amount,
        kind: "income",
      });
    }

    // Recurring rules whose dayOfMonth lands here.
    for (const rule of args.rules) {
      if (!rule.active) continue;
      if (rule.dayOfMonth !== day) continue;
      if (paidThisMonth.has(rule.id)) continue;
      if (!ruleSchedule(rule, monthKey).active) continue;
      outflows += rule.estimatedAmount;
      events.push({
        label: rule.label,
        amount: -rule.estimatedAmount,
        kind: rule.installmentTotal ? "installment" : "rule",
      });
    }

    // Loan installments.
    for (const loan of args.loans) {
      if (loan.dayOfMonth !== day) continue;
      if (!loanSchedule(loan, monthKey).active) continue;
      outflows += loan.monthlyInstallment;
      events.push({
        label: loan.label,
        amount: -loan.monthlyInstallment,
        kind: "loan",
      });
    }

    // Card slices whose chargeDate lands on this day.
    for (const entry of args.entries) {
      if (entry.needsConfirmation || entry.bankPending || entry.isRefund) {
        continue;
      }
      if (entry.currency && entry.currency !== "ILS") continue;
      const slice = sliceForMonth(entry, monthKey);
      if (!slice) continue;
      if (slice.chargeDate.getDate() !== day) continue;
      outflows += slice.amount;
      events.push({
        label: entry.merchant ?? entry.note ?? "חיוב",
        amount: -slice.amount,
        kind: "card",
      });
    }

    const net = inflows - outflows;
    running += net;

    // Sort events by absolute amount so the heaviest line shows first.
    events.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

    days.push({
      day,
      date: dayDate,
      isToday: day === todayDay,
      isPast: isCurrentMonth && day < todayDay,
      inflows,
      outflows,
      net,
      runningBalance: running,
      events,
    });
  }

  return {
    monthKey,
    startBalance,
    endBalance: running,
    days,
  };
}
