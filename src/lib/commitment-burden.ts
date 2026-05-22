// Aggregate commitment burden.
//
// Phase 2/4 extension — answers "across every active installment
// plan + active loan, how much committed money is still on the
// table, and how long until I'm free?"
//
// Pure compute. Uses the existing ruleSchedule + loanSchedule so
// the per-month "is this firing?" + remaining-payments math stays
// in one place.

import type {
  Loan,
  MonthKey,
  RecurringRule,
} from "@/types/finance";
import { loanSchedule, ruleSchedule } from "@/lib/installment-schedule";
import { monthKeyOf } from "@/lib/dates";

export type CommitmentItem = {
  id: string;
  label: string;
  kind: "loan" | "installment-rule";
  monthlyAmount: number;
  remainingPayments: number;
  remainingTotal: number;
  endMonth?: MonthKey;
};

export type CommitmentBurden = {
  totalRemaining: number;
  monthlyOutflow: number;
  plansActive: number;
  longestEndMonth?: MonthKey;
  byKind: {
    loans: { count: number; totalRemaining: number };
    installments: { count: number; totalRemaining: number };
  };
  items: CommitmentItem[];
};

function monthIndexFromKey(key: MonthKey): number {
  const [y, m] = key.split("-").map(Number);
  return y * 12 + (m - 1);
}

export function commitmentBurden(args: {
  loans: Loan[];
  rules: RecurringRule[];
  monthKey?: MonthKey;
}): CommitmentBurden {
  const monthKey = args.monthKey ?? monthKeyOf(new Date());
  const items: CommitmentItem[] = [];
  let totalRemaining = 0;
  let monthlyOutflow = 0;
  let loanCount = 0;
  let loanTotal = 0;
  let instCount = 0;
  let instTotal = 0;
  let longestIdx = -Infinity;
  let longestKey: MonthKey | undefined;

  for (const loan of args.loans) {
    if (!loan.active) continue;
    const sched = loanSchedule(loan, monthKey);
    if (!sched.active) continue;
    // `remaining` is "payments AFTER this month, inclusive of this
    // month if the rule still bills". For schedules with explicit
    // totalPayments, sched.remaining + 1 = total still to pay.
    const remaining =
      sched.remaining !== undefined
        ? sched.remaining + 1
        : // Open-ended loan — no schedule end. Skip aggregation
          // (can't bound it).
          undefined;
    if (remaining === undefined) continue;
    const remainingTotal = remaining * loan.monthlyInstallment;
    items.push({
      id: loan.id,
      label: loan.label,
      kind: "loan",
      monthlyAmount: loan.monthlyInstallment,
      remainingPayments: remaining,
      remainingTotal,
      endMonth: sched.endMonthKey,
    });
    totalRemaining += remainingTotal;
    monthlyOutflow += loan.monthlyInstallment;
    loanCount += 1;
    loanTotal += remainingTotal;
    if (sched.endMonthKey) {
      const idx = monthIndexFromKey(sched.endMonthKey);
      if (idx > longestIdx) {
        longestIdx = idx;
        longestKey = sched.endMonthKey;
      }
    }
  }

  for (const rule of args.rules) {
    if (!rule.active) continue;
    if (!rule.installmentTotal) continue;
    const sched = ruleSchedule(rule, monthKey);
    if (!sched.active) continue;
    const remaining =
      sched.remaining !== undefined ? sched.remaining + 1 : undefined;
    if (remaining === undefined) continue;
    const remainingTotal = remaining * rule.estimatedAmount;
    items.push({
      id: rule.id,
      label: rule.label,
      kind: "installment-rule",
      monthlyAmount: rule.estimatedAmount,
      remainingPayments: remaining,
      remainingTotal,
      endMonth: sched.endMonthKey,
    });
    totalRemaining += remainingTotal;
    monthlyOutflow += rule.estimatedAmount;
    instCount += 1;
    instTotal += remainingTotal;
    if (sched.endMonthKey) {
      const idx = monthIndexFromKey(sched.endMonthKey);
      if (idx > longestIdx) {
        longestIdx = idx;
        longestKey = sched.endMonthKey;
      }
    }
  }

  items.sort((a, b) => b.remainingTotal - a.remainingTotal);

  return {
    totalRemaining,
    monthlyOutflow,
    plansActive: items.length,
    longestEndMonth: longestKey,
    byKind: {
      loans: { count: loanCount, totalRemaining: loanTotal },
      installments: { count: instCount, totalRemaining: instTotal },
    },
    items,
  };
}
