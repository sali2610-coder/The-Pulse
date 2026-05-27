// Phase 239+240 — transparent breakdown of the future-balance math.
//
// Walks the same liquidityCurve the HeroFutureBalanceCard already
// uses, then splits the events that fall between today (idx 0) and
// the chosen snapshot date into the user-facing categories
// requested in the brief:
//
//   starting bank balance
//   + income expected
//   - credit card settlements
//   - bank fixed expenses
//   - loans
//   - pending confirmed expenses (currently 0 — see note below)
//   = projected balance on date X
//
// `excludedPending` reports how many entries were skipped by the
// engine because they carried `needsConfirmation` or `bankPending`
// without `confirmedAt`. The UI surfaces that as a transparency
// line so the user knows WHY their pending charge isn't reflected.
//
// Pure compute. No store / React.

import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import { liquidityCurve } from "@/lib/liquidity-curve";

export type FutureBalanceBreakdown = {
  whenISO: string;
  startingBalance: number;
  income: number;
  cardSettlements: number;
  bankFixed: number;
  loans: number;
  projectedBalance: number;
  /** Pending entries the curve engine deliberately skipped. The UI
   *  surfaces a transparency line so the user knows why their
   *  "תלוי ועומד" SMS isn't in the projection yet. */
  excludedPendingCount: number;
  excludedPendingTotal: number;
};

export function buildFutureBalanceBreakdown(args: {
  accounts: Account[];
  loans: Loan[];
  incomes: Income[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  entries: ExpenseEntry[];
  /** 0-indexed offset from today. Day 0 = today, 30 = +30 days. */
  offset: number;
  now?: Date;
  windowDays?: number;
}): FutureBalanceBreakdown {
  const now = args.now ?? new Date();
  const curve = liquidityCurve({
    accounts: args.accounts,
    loans: args.loans,
    incomes: args.incomes,
    rules: args.rules,
    statuses: args.statuses,
    entries: args.entries,
    now,
    windowDays: args.windowDays ?? 60,
  });

  const startingBalance = curve.startingBalance;
  const clamped = Math.min(
    Math.max(0, args.offset),
    curve.points.length - 1,
  );
  const target = curve.points[clamped];

  let income = 0;
  let cardSettlements = 0;
  let bankFixed = 0;
  let loans = 0;
  for (let i = 1; i <= clamped; i++) {
    for (const e of curve.points[i].events) {
      switch (e.kind) {
        case "income":
          income += e.amount; // positive
          break;
        case "card":
          cardSettlements += Math.abs(e.amount);
          break;
        case "bank_debit":
          bankFixed += Math.abs(e.amount);
          break;
        case "loan":
          loans += Math.abs(e.amount);
          break;
      }
    }
  }

  // Count entries the engine excluded from the projection so the
  // explain panel can warn the user transparently.
  let excludedPendingCount = 0;
  let excludedPendingTotal = 0;
  const horizonTs = new Date(target.whenISO).getTime();
  for (const entry of args.entries) {
    if (!entry.bankPending && !entry.needsConfirmation) continue;
    if (entry.confirmedAt) continue; // already counted via the curve.
    const charge = new Date(entry.chargeDate).getTime();
    if (charge < now.getTime()) continue;
    if (charge > horizonTs) continue;
    excludedPendingCount++;
    excludedPendingTotal += Math.max(0, entry.amount ?? 0);
  }

  return {
    whenISO: target.whenISO,
    startingBalance: round2(startingBalance),
    income: round2(income),
    cardSettlements: round2(cardSettlements),
    bankFixed: round2(bankFixed),
    loans: round2(loans),
    projectedBalance: round2(target.balance),
    excludedPendingCount,
    excludedPendingTotal: round2(excludedPendingTotal),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
