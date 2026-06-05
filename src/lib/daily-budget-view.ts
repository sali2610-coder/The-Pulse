// Phase 381 — canonical "תקציב יומי / אפשר להוציא היום" view.
//
// Single source of truth for the daily-budget surface. Anchored on
// the 10th of next month — the calm point after salary lands AND
// the big credit-card billing day passes, giving the user the most
// honest "what's actually left" reading.
//
// View shape pins:
//
//   anchorISO              ISO of the 10th of next month
//   anchorOffset           days from today to anchor (>=1)
//   currentBankBalance     Σ active bank anchors right now
//   forecastBankAtAnchor   liquidityCurve balance on the anchor day
//   expectedIncome         Σ income events between now and anchor
//   totalCommitments       getMonthlyObligationBreakdown.total
//                          for the CURRENT month (cockpit canonical)
//   monthlyFreeBalance     expectedIncome − totalCommitments
//   realAvailable          forecastBankAtAnchor — CAN BE NEGATIVE
//   spentToday             todayPulse.spentToday
//   perDay                 max(0, realAvailable / anchorOffset)
//   deficit                max(0, −realAvailable)
//   state                  "deficit" | "tight" | "calm"
//
// Engine math reused verbatim — liquidityCurve + todayPulse +
// getMonthlyObligationBreakdown. This helper only COMPOSES them so
// every daily-budget surface reads the same answer.

import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import { liquidityCurve } from "@/lib/liquidity-curve";
import { todayPulse } from "@/lib/today-pulse";
import { getMonthlyObligationBreakdown } from "@/lib/monthly-obligation-breakdown";

export type DailyBudgetState = "deficit" | "tight" | "calm";

export type DailyBudgetView = {
  anchorISO: string;
  anchorOffset: number;
  currentBankBalance: number;
  forecastBankAtAnchor: number;
  expectedIncome: number;
  totalCommitments: number;
  monthlyFreeBalance: number;
  realAvailable: number;
  spentToday: number;
  perDay: number;
  deficit: number;
  state: DailyBudgetState;
};

function tenthOfNextMonth(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth() + 1, 10, 12, 0, 0);
}

function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function monthKeyOf(d: Date): `${number}-${number}` {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` as `${number}-${number}`;
}

const TIGHT_PER_DAY = 25; // ₪ — below this the day reads tight

export function buildDailyBudgetView(args: {
  accounts: Account[];
  loans: Loan[];
  incomes: Income[];
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  now?: Date;
}): DailyBudgetView {
  const now = args.now ?? new Date();
  const anchor = tenthOfNextMonth(now);
  const anchorOffset = Math.max(1, daysBetween(now, anchor));

  // Ensure the curve reaches the anchor day with breathing room.
  const windowDays = anchorOffset + 5;
  const curve = liquidityCurve({
    accounts: args.accounts,
    loans: args.loans,
    incomes: args.incomes,
    rules: args.rules,
    statuses: args.statuses,
    entries: args.entries,
    now,
    windowDays,
  });

  const anchorIdx = Math.min(curve.points.length - 1, anchorOffset);
  const forecastBankAtAnchor = Math.round(
    curve.points[anchorIdx]?.balance ?? curve.startingBalance,
  );
  const currentBankBalance = Math.round(curve.startingBalance);

  // Income events strictly inside (now, anchor].
  let expectedIncome = 0;
  for (let i = 1; i <= anchorIdx; i++) {
    for (const ev of curve.points[i].events) {
      if (ev.kind === "income") expectedIncome += ev.amount;
    }
  }
  expectedIncome = Math.round(expectedIncome);

  const obligations = getMonthlyObligationBreakdown({
    rules: args.rules,
    loans: args.loans,
    entries: args.entries,
    statuses: args.statuses,
    monthKey: monthKeyOf(now),
  });
  const totalCommitments = obligations.total;
  const monthlyFreeBalance = expectedIncome - totalCommitments;

  const pulse = todayPulse({
    entries: args.entries,
    rules: args.rules,
    statuses: args.statuses,
    monthlyBudget: 0,
    incomes: args.incomes,
    now,
  });
  const spentToday = Math.round(pulse.spentToday);

  const realAvailable = forecastBankAtAnchor;
  const perDay =
    realAvailable > 0 ? Math.round(realAvailable / anchorOffset) : 0;
  const deficit = realAvailable < 0 ? Math.abs(realAvailable) : 0;
  const state: DailyBudgetState =
    realAvailable < 0
      ? "deficit"
      : perDay < TIGHT_PER_DAY
        ? "tight"
        : "calm";

  return {
    anchorISO: anchor.toISOString(),
    anchorOffset,
    currentBankBalance,
    forecastBankAtAnchor,
    expectedIncome,
    totalCommitments,
    monthlyFreeBalance,
    realAvailable,
    spentToday,
    perDay,
    deficit,
    state,
  };
}
