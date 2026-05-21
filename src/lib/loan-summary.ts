// Aggregate active-loan picture.
//
// For the dashboard "all-loans" widget: sum of monthly burden, sum
// of remaining principal, projected debt-free month (across every
// active loan), and the count of loans completing within the next
// 3 months so the user gets a heads-up before a major outflow
// disappears from the budget.
//
// Pure compute — no mutation, no persistence.

import type { Loan, MonthKey } from "@/types/finance";
import { monthIndex } from "@/lib/dates";
import { loanSchedule } from "@/lib/installment-schedule";

export type LoanSummary = {
  /** Σ monthlyInstallment of loans whose schedule is firing in `monthKey`. */
  totalMonthly: number;
  /** Σ (monthlyInstallment × remainingPayments) across all loans. Falls
   *  back to legacy `remainingBalance` when the loan lacks
   *  startMonth/totalPayments. */
  totalRemaining: number;
  /** Latest endMonthKey across all in-flight loans, or undefined when
   *  none of the loans have a finite schedule. */
  debtFreeMonthKey?: MonthKey;
  /** Loans currently firing this month. */
  activeCount: number;
  /** Loans whose schedule ends within `monthKey`..`+horizon` months. */
  completedSoonCount: number;
};

const DEFAULT_HORIZON = 3;

function monthsBetween(target: MonthKey, end: MonthKey): number {
  return monthIndex(end) - monthIndex(target);
}

export function summarizeLoans(args: {
  loans: Loan[];
  monthKey: MonthKey;
  horizonMonths?: number;
}): LoanSummary {
  const horizon = args.horizonMonths ?? DEFAULT_HORIZON;
  let totalMonthly = 0;
  let totalRemaining = 0;
  let activeCount = 0;
  let completedSoonCount = 0;
  let furthestEnd: MonthKey | undefined;

  for (const loan of args.loans) {
    if (!loan.active) continue;
    const sched = loanSchedule(loan, args.monthKey);
    if (!sched.active) continue;
    activeCount += 1;
    totalMonthly += loan.monthlyInstallment;
    if (sched.remaining !== undefined) {
      totalRemaining +=
        loan.monthlyInstallment * (sched.remaining + 1); // include this month
    } else if (typeof loan.remainingBalance === "number") {
      totalRemaining += loan.remainingBalance;
    }
    if (sched.endMonthKey) {
      if (
        !furthestEnd ||
        monthIndex(sched.endMonthKey) > monthIndex(furthestEnd)
      ) {
        furthestEnd = sched.endMonthKey;
      }
      const monthsLeft = monthsBetween(args.monthKey, sched.endMonthKey);
      if (monthsLeft >= 0 && monthsLeft <= horizon) {
        completedSoonCount += 1;
      }
    }
  }

  return {
    totalMonthly,
    totalRemaining,
    debtFreeMonthKey: furthestEnd,
    activeCount,
    completedSoonCount,
  };
}
