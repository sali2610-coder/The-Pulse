// Auto-progression helpers for RecurringRule + Loan.
//
// Both entities support "fire monthly for N months starting at month X
// of year Y". The user never updates payment counters — every read derives
// them from (now, startMonth, startYear, totalPayments).

import type { Loan, MonthKey, RecurringRule } from "@/types/finance";
import { monthIndex } from "@/lib/dates";

export type Schedule = {
  /** True when this rule/loan is still firing in `monthKey`. */
  active: boolean;
  /** 1-based index of the payment that falls in `monthKey` (1..total).
   *  Undefined when the schedule is not active that month. */
  paymentNumber?: number;
  /** Total payments. Undefined for non-installment recurring bills. */
  totalPayments?: number;
  /** Payments left after this month (inclusive). Undefined for
   *  open-ended bills. */
  remaining?: number;
  /** `YYYY-MM` of the last payment, or undefined for open-ended. */
  endMonthKey?: MonthKey;
};

function monthKeyFromIndex(idx: number): MonthKey {
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Compute schedule state for a RecurringRule in `monthKey`. */
export function ruleSchedule(rule: RecurringRule, monthKey: MonthKey): Schedule {
  if (!rule.active) return { active: false };

  // Regular monthly bill — always active.
  if (
    !rule.installmentTotal ||
    !rule.startMonth ||
    !rule.startYear ||
    rule.installmentTotal <= 0
  ) {
    return { active: true };
  }

  const startIdx = rule.startYear * 12 + (rule.startMonth - 1);
  const monthIdx = monthIndex(monthKey);
  const offset = monthIdx - startIdx;
  if (offset < 0) return { active: false };
  if (offset >= rule.installmentTotal) return { active: false };
  const paymentNumber = offset + 1;
  const remaining = rule.installmentTotal - paymentNumber;
  const endIdx = startIdx + rule.installmentTotal - 1;
  return {
    active: true,
    paymentNumber,
    totalPayments: rule.installmentTotal,
    remaining,
    endMonthKey: monthKeyFromIndex(endIdx),
  };
}

/** Compute schedule state for a Loan in `monthKey`. Prefers the new
 *  start+total fields; falls back to the legacy `endDate` shape so
 *  pre-migration loans keep working. */
export function loanSchedule(loan: Loan, monthKey: MonthKey): Schedule {
  if (!loan.active) return { active: false };

  // New shape: explicit start + total payments.
  if (loan.startMonth && loan.startYear && loan.totalPayments && loan.totalPayments > 0) {
    const startIdx = loan.startYear * 12 + (loan.startMonth - 1);
    const monthIdx = monthIndex(monthKey);
    const offset = monthIdx - startIdx;
    if (offset < 0) return { active: false };
    if (offset >= loan.totalPayments) return { active: false };
    const paymentNumber = offset + 1;
    const remaining = loan.totalPayments - paymentNumber;
    const endIdx = startIdx + loan.totalPayments - 1;
    return {
      active: true,
      paymentNumber,
      totalPayments: loan.totalPayments,
      remaining,
      endMonthKey: monthKeyFromIndex(endIdx),
    };
  }

  // Legacy shape: endDate carries the schedule end, no progress metadata.
  if (loan.endDate) {
    const end = new Date(loan.endDate);
    if (Number.isNaN(end.getTime())) return { active: true };
    const endMonthKeyValue: MonthKey = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}`;
    const endIdx = monthIndex(endMonthKeyValue);
    const monthIdx = monthIndex(monthKey);
    if (monthIdx > endIdx) return { active: false };
    return { active: true, endMonthKey: endMonthKeyValue };
  }

  // Open-ended loan — keep firing.
  return { active: true };
}
