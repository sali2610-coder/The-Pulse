// Account-bridge — connects the user's bank balance with this
// month's spend, income, and still-pending obligations so the
// dashboard can answer:
//
//   "If this is my balance now, and this is what I already spent,
//    what is my real expected position by end of month?"
//
// Reuses the canonical financial engine — `monthlySpent` for the
// already-charged number and `forecastEndOfMonth` for the obligation
// breakdown. Nothing is recomputed here; we just package the
// existing numbers into a single object so the bridge card and the
// expected-balance card can read the same source.

import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import { monthKeyOf } from "@/lib/dates";
import { forecastEndOfMonth } from "@/lib/forecast";
import { monthlySpent } from "@/lib/monthly-spent";

export type AccountBridge = {
  monthKey: MonthKey;
  /** Σ active bank-account anchors. Negative when overdrawn. */
  currentBankBalance: number;
  /** Already charged this month (no refunds, no FX, no pending). */
  spentThisMonth: number;
  /** Refunds already credited this month (positive number). */
  refundCreditThisMonth: number;
  /** Active income records whose dayOfMonth >= today (still
   *  expected to land this month). */
  expectedIncomeRemaining: number;
  /** Active income records that should have already landed today
   *  or earlier (informational; some of it may already be reflected
   *  in the anchor). */
  incomeAlreadyDueThisMonth: number;
  /** Recurring rules + loans + future card slices not yet posted —
   *  the same numbers forecastEndOfMonth uses for its EOM math.
   *  Each is exposed so the bridge UI can show the breakdown.  */
  pendingFixed: number;
  pendingLoans: number;
  pendingCardCharges: number;
  pendingObligationsTotal: number;
  /**
   *   currentBankBalance
   * + expectedIncomeRemaining
   * − pendingObligationsTotal
   * = expectedBalanceAfterAllObligations
   *
   * Identical to `forecastEndOfMonth(...).forecast`, but exposed
   * under a name the dashboard cards reference. spentThisMonth is
   * NOT subtracted here because the bank anchor already reflects it
   * (the user typed yesterday's balance, charges since then have
   * already moved that balance). */
  expectedBalanceAfterAllObligations: number;
};

export function accountBridge(args: {
  accounts: Account[];
  loans: Loan[];
  incomes: Income[];
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  monthKey?: MonthKey;
  now?: Date;
}): AccountBridge {
  const now = args.now ?? new Date();
  const monthKey: MonthKey = args.monthKey ?? monthKeyOf(now);

  const spent = monthlySpent({ entries: args.entries, monthKey, now });

  // Phase 213 — bridge opts into the effective-cash lens so its
  // numbers match the safe-to-spend + liquidity-curve engines.
  // Card-linked rules now settle on the linked card's paymentDay
  // and entries whose slice lands in a future month no longer
  // subtract from this month.
  const eom = forecastEndOfMonth({
    accounts: args.accounts,
    loans: args.loans,
    incomes: args.incomes,
    entries: args.entries,
    rules: args.rules,
    statuses: args.statuses,
    monthKey,
    now,
    useEffectiveCashDates: true,
  });

  // Income split — incomes whose dayOfMonth >= today are "remaining",
  // the rest are "already due". `forecastEndOfMonth.expectedIncome`
  // is the remaining-only bucket.
  const today = monthKeyOf(now) === monthKey ? now.getDate() : 1;
  let incomeAlreadyDue = 0;
  for (const inc of args.incomes) {
    if (!inc.active) continue;
    if (inc.amount <= 0) continue;
    if (inc.dayOfMonth >= today) continue;
    incomeAlreadyDue += inc.amount;
  }

  const pendingObligations =
    eom.pendingFixed + eom.pendingLoans + eom.futureCardSlices;

  return {
    monthKey,
    currentBankBalance: eom.totalAnchors,
    spentThisMonth: spent.spentSoFar,
    refundCreditThisMonth: spent.refundCredit,
    expectedIncomeRemaining: eom.expectedIncome,
    incomeAlreadyDueThisMonth: round2(incomeAlreadyDue),
    pendingFixed: eom.pendingFixed,
    pendingLoans: eom.pendingLoans,
    pendingCardCharges: eom.futureCardSlices,
    pendingObligationsTotal: round2(pendingObligations),
    expectedBalanceAfterAllObligations: eom.forecast,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
