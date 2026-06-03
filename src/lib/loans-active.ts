// Phase 343 — canonical "active monthly loans" total.
//
// One function the Loans Panel + every forecast surface + the
// FutureBalanceExplain breakdown call. Returns the Σ of
// `loan.monthlyInstallment` for every loan that is:
//
//   - `active === true`, AND
//   - currently firing per its installment schedule for `monthKey`
//     (open-ended loans qualify automatically; finite plans qualify
//     only while they're within their [startMonth, endMonth] window).
//
// What it deliberately does NOT do:
//
//   - Count the same loan more than once when a 35–60 day forecast
//     window spans a month rollover (the liquidity curve emits two
//     events for a loan whose dayOfMonth ≤ horizon-day; that's
//     correct for cash-flow math but the explain panel row should
//     match the user's Loans Panel total — Σ monthlyInstallment).
//   - Include inactive / deleted loans.
//   - Sum future installment plans that haven't started or finite
//     plans that already completed (loanSchedule.active === false).

import type { Loan, MonthKey } from "@/types/finance";
import { loanSchedule } from "@/lib/installment-schedule";

export function activeMonthlyLoansTotal(args: {
  loans: Loan[];
  monthKey: MonthKey;
}): number {
  let sum = 0;
  for (const loan of args.loans) {
    if (!loan.active) continue;
    if (!loanSchedule(loan, args.monthKey).active) continue;
    sum += loan.monthlyInstallment;
  }
  return sum;
}
