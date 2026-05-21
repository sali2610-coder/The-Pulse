// Fixed-cost ratio — how much of monthly income is already committed
// before the user spends a shekel on anything variable.
//
// A high ratio means the user has little discretionary room each
// month. This helper turns the existing rule + loan + income
// streams into a single percentage so the dashboard can flag
// over-committed months at a glance.
//
// Pure compute — no mutation, no persistence.

import type {
  Income,
  Loan,
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import { loanSchedule, ruleSchedule } from "@/lib/installment-schedule";
import { buildStatusMap } from "@/lib/projections";

export type FixedCostRatio = {
  totalIncome: number;
  recurringFixed: number;
  loanFixed: number;
  totalFixed: number;
  ratio: number;
  severity: "calm" | "watch" | "warn" | "alert";
  /** Remaining variable budget = income - fixed. Can go negative. */
  variableHeadroom: number;
};

const WATCH_RATIO = 0.4;
const WARN_RATIO = 0.55;
const ALERT_RATIO = 0.75;

function severityFor(ratio: number): FixedCostRatio["severity"] {
  if (ratio >= ALERT_RATIO) return "alert";
  if (ratio >= WARN_RATIO) return "warn";
  if (ratio >= WATCH_RATIO) return "watch";
  return "calm";
}

export function computeFixedCostRatio(args: {
  rules: RecurringRule[];
  loans: Loan[];
  incomes: Income[];
  statuses: RecurringStatus[];
  monthKey: MonthKey;
}): FixedCostRatio | null {
  const totalIncome = args.incomes.reduce(
    (sum, i) => (i.active ? sum + i.amount : sum),
    0,
  );
  if (totalIncome <= 0) return null;

  const statusMap = buildStatusMap(args.statuses);
  let recurringFixed = 0;
  for (const rule of args.rules) {
    if (!rule.active) continue;
    const sched = ruleSchedule(rule, args.monthKey);
    if (!sched.active) continue;
    const status = statusMap.get(`${rule.id}__${args.monthKey}`);
    // Use actual amount when matched, otherwise estimated.
    const amount =
      status?.status === "paid" && typeof status.actualAmount === "number"
        ? status.actualAmount
        : rule.estimatedAmount;
    recurringFixed += amount;
  }

  let loanFixed = 0;
  for (const loan of args.loans) {
    if (!loan.active) continue;
    const sched = loanSchedule(loan, args.monthKey);
    if (!sched.active) continue;
    loanFixed += loan.monthlyInstallment;
  }

  const totalFixed = recurringFixed + loanFixed;
  const ratio = Math.max(0, totalFixed / totalIncome);
  return {
    totalIncome,
    recurringFixed,
    loanFixed,
    totalFixed,
    ratio,
    severity: severityFor(ratio),
    variableHeadroom: totalIncome - totalFixed,
  };
}
