// Net-worth snapshot.
//
// Bottom-line wealth picture from the user's tracked entities:
//   assets  = Σ active bank anchorBalance (positives) + Σ negatives split out as debt
//   debts   = Σ card debt + Σ remaining loan principal + Σ negative bank anchors
//   net     = assets - debts
//
// Pure compute. Reuses Phase 100 cycle projection for cards that don't
// have a manual `currentDebt` value, so even users who don't track
// debt by hand get a meaningful number.

import type {
  Account,
  Loan,
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import { loanSchedule } from "@/lib/installment-schedule";
import { projectCardCycle } from "@/lib/card-cycle";

export type NetWorthBreakdown = {
  /** Σ positive bank anchorBalance (cash on hand). */
  assets: number;
  /** Σ |negative bank anchorBalance| — overdraft counts as debt. */
  overdraft: number;
  /** Σ card currentDebt (fallback to cycle projection). */
  cardDebt: number;
  /** Σ remaining loan principal across active loans. */
  loanDebt: number;
  /** Total debt = overdraft + cardDebt + loanDebt. */
  totalDebt: number;
  /** assets - totalDebt. Can go negative. */
  netWorth: number;
};

export function computeNetWorth(args: {
  accounts: Account[];
  loans: Loan[];
  entries: import("@/types/finance").ExpenseEntry[];
  /** Optional — when supplied, card-debt projection includes
   *  card-linked recurring rules + installment plans that fire inside
   *  the open cycle window. Older callers that omit this still get the
   *  pre-existing entry-only projection. */
  rules?: RecurringRule[];
  statuses?: RecurringStatus[];
  monthKey: MonthKey;
}): NetWorthBreakdown {
  let assets = 0;
  let overdraft = 0;
  let cardDebt = 0;
  let loanDebt = 0;

  for (const a of args.accounts) {
    if (!a.active) continue;
    if (a.kind === "bank") {
      const balance = a.anchorBalance ?? 0;
      if (balance >= 0) assets += balance;
      else overdraft += Math.abs(balance);
    } else if (a.kind === "card") {
      if (typeof a.currentDebt === "number" && a.currentDebt > 0) {
        cardDebt += a.currentDebt;
        continue;
      }
      const projection = projectCardCycle({
        account: a,
        entries: args.entries,
        rules: args.rules,
        statuses: args.statuses,
      });
      if (projection) cardDebt += projection.projectedAmount;
    }
  }

  for (const loan of args.loans) {
    if (!loan.active) continue;
    const sched = loanSchedule(loan, args.monthKey);
    if (!sched.active) continue;
    if (sched.remaining !== undefined) {
      loanDebt += loan.monthlyInstallment * (sched.remaining + 1);
    } else if (typeof loan.remainingBalance === "number") {
      loanDebt += loan.remainingBalance;
    }
  }

  const totalDebt = overdraft + cardDebt + loanDebt;
  const netWorth = assets - totalDebt;

  return {
    assets,
    overdraft,
    cardDebt,
    loanDebt,
    totalDebt,
    netWorth,
  };
}
