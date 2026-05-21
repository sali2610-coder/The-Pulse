// Installment-deal intelligence.
//
// For installment-mode RecurringRules + Loans, surface the full deal
// context — total amount, paid so far, remaining, projected end date.
// Pure derivation; no new fields stored on disk. Drives the UI summary
// block in RecurringRulesPanel + LoansPanel + the future analytics
// surface.
//
// Live-engine contract preserved — inputs are RecurringRule/Loan plus
// the current monthKey, identical to what ruleSchedule/loanSchedule
// already consume.

import type { Loan, MonthKey, RecurringRule } from "@/types/finance";
import { loanSchedule, ruleSchedule } from "@/lib/installment-schedule";

export type InstallmentSummary = {
  monthlyPayment: number;
  installmentCount: number;
  installmentsPaid: number;
  installmentsRemaining: number;
  totalDealAmount: number;
  totalAlreadyPaid: number;
  totalRemaining: number;
  /** `YYYY-MM` of the LAST payment. Undefined if the rule never started
   *  (future-dated schedule). */
  projectedEndMonthKey?: MonthKey;
  /** True when the plan finished (every installment already billed). */
  isComplete?: boolean;
  /** True when the plan hasn't started yet. */
  isFuture?: boolean;
};

function fmtMonthKey(monthKey?: MonthKey): MonthKey | undefined {
  return monthKey;
}

export function buildRuleInstallmentSummary(
  rule: RecurringRule,
  monthKey: MonthKey,
): InstallmentSummary | null {
  if (!rule.installmentTotal || rule.installmentTotal <= 0) return null;
  const sched = ruleSchedule(rule, monthKey);
  const monthly = rule.estimatedAmount;
  const total = rule.installmentTotal;
  // Past-end → all paid. Future → none paid. Active → paymentNumber.
  const paid = sched.isComplete
    ? total
    : sched.isFuture
      ? 0
      : sched.paymentNumber ?? 0;
  const remaining = Math.max(0, total - paid);
  return {
    monthlyPayment: monthly,
    installmentCount: total,
    installmentsPaid: paid,
    installmentsRemaining: remaining,
    totalDealAmount: monthly * total,
    totalAlreadyPaid: monthly * paid,
    totalRemaining: monthly * remaining,
    projectedEndMonthKey: fmtMonthKey(sched.endMonthKey),
    isComplete: sched.isComplete || undefined,
    isFuture: sched.isFuture || undefined,
  };
}

export function buildLoanInstallmentSummary(
  loan: Loan,
  monthKey: MonthKey,
): InstallmentSummary | null {
  if (!loan.totalPayments || loan.totalPayments <= 0) return null;
  const sched = loanSchedule(loan, monthKey);
  const monthly = loan.monthlyInstallment;
  const total = loan.totalPayments;
  const paid = sched.isComplete
    ? total
    : sched.isFuture
      ? 0
      : sched.paymentNumber ?? 0;
  const remaining = Math.max(0, total - paid);
  return {
    monthlyPayment: monthly,
    installmentCount: total,
    installmentsPaid: paid,
    installmentsRemaining: remaining,
    totalDealAmount: monthly * total,
    totalAlreadyPaid: monthly * paid,
    totalRemaining: monthly * remaining,
    projectedEndMonthKey: fmtMonthKey(sched.endMonthKey),
    isComplete: sched.isComplete || undefined,
    isFuture: sched.isFuture || undefined,
  };
}
