// Phase 239+240 — transparent breakdown of the future-balance math.
// Phase 345 — Δ-only semantics + itemized event list.
//
// The breakdown answers a single question: between today's bank
// position and the date the user picked, WHAT changed, line-item
// by line-item?
//
//   startingBalance      bank anchor at "today"
//   + deltaIncome        Σ income events in (today, target]
//   − deltaCreditCards   Σ card-settlement events in (today, target]
//   − deltaBankFixed     Σ bank-direct-debit events in (today, target]
//   − deltaLoans         Σ loan events in (today, target]
//   − deltaManualExpenses Σ forward-dated manual cash entries in
//                         (today, target]
//   = projectedBalance
//
// Events that already settled (chargeDate ≤ now) are NOT in the Δ —
// they're already baked into startingBalance via the bank anchor.
//
// `includedItems` lists every event that contributed to a delta so
// the UI can render a per-event timeline ("car loan ₪870 on June 5",
// not just "loans ₪4,970").
//
// `excludedPending` reports entries the engine deliberately skipped
// (bankPending / needsConfirmation without confirmedAt) so the user
// understands why an "תלוי ועומד" SMS isn't in the projection yet.
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

export type ForecastItemKind =
  | "income"
  | "credit"
  | "bank_fixed"
  | "loan"
  | "manual_expense";

export type ForecastItem = {
  /** Display label — merchant / income source / loan name. */
  label: string;
  /** Always positive — the kind decides the sign in the UI. */
  amount: number;
  /** Phase 347 — ISO of when the underlying transaction happened.
   *  For card purchases this is the purchase / chargeDate. */
  transactionDateISO: string;
  /** Phase 347 — ISO of when the cash actually leaves / enters the
   *  bank. For credit purchases this is the next card-billing day;
   *  for cash / bank / loan / income it equals transactionDateISO. */
  bankImpactDateISO: string;
  /** Legacy alias for bankImpactDateISO. Kept so existing readers
   *  (CSV exports, older test snapshots) keep working. */
  dateISO: string;
  kind: ForecastItemKind;
  /** Optional card display label ("Visa ****1234") when kind="credit". */
  cardLabel?: string;
  /** True when the event has yet to land (always true today —
   *  past events don't enter `includedItems`). Kept as an explicit
   *  field so the UI can later toggle "show what already settled". */
  expected: true;
};

export type FutureBalanceBreakdown = {
  whenISO: string;
  startingBalance: number;
  /** Phase 345 — Δ between today and target. Renamed-by-spec aliases
   *  preserved alongside the legacy field names so existing consumers
   *  keep working through the rename. */
  income: number;
  cardSettlements: number;
  bankFixed: number;
  loans: number;
  /** Forward-dated manual cash entries that the curve doesn't route
   *  through the card stream. */
  manualExpenses: number;
  /** Aliases matching the spec's vocabulary. */
  deltaIncome: number;
  deltaCreditCards: number;
  deltaBankFixedCharges: number;
  deltaLoans: number;
  deltaManualExpenses: number;
  finalBalance: number;
  projectedBalance: number;
  /** Per-event timeline. Sorted by dateISO ascending. */
  includedItems: ForecastItem[];
  /** Pending entries the curve engine deliberately skipped. */
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
  const horizonTs = new Date(target.whenISO).getTime();
  const nowTs = now.getTime();

  // Δ sums + per-event timeline. Each event represents a real cash
  // impact between (today, target]; nothing that already settled is
  // included.
  let deltaIncome = 0;
  let deltaCreditCards = 0;
  let deltaBankFixed = 0;
  let deltaLoans = 0;
  const items: ForecastItem[] = [];

  for (let i = 1; i <= clamped; i++) {
    for (const e of curve.points[i].events) {
      const amount = Math.abs(e.amount);
      const txIso = e.transactionISO ?? e.whenISO;
      const impactIso = e.whenISO;
      switch (e.kind) {
        case "income":
          deltaIncome += e.amount; // positive
          items.push({
            label: e.label,
            amount,
            transactionDateISO: txIso,
            bankImpactDateISO: impactIso,
            dateISO: impactIso,
            kind: "income",
            expected: true,
          });
          break;
        case "card":
          deltaCreditCards += amount;
          items.push({
            label: e.label,
            amount,
            transactionDateISO: txIso,
            bankImpactDateISO: impactIso,
            dateISO: impactIso,
            kind: "credit",
            cardLabel: e.cardLabel,
            expected: true,
          });
          break;
        case "bank_debit":
          deltaBankFixed += amount;
          items.push({
            label: e.label,
            amount,
            transactionDateISO: txIso,
            bankImpactDateISO: impactIso,
            dateISO: impactIso,
            kind: "bank_fixed",
            expected: true,
          });
          break;
        case "loan":
          deltaLoans += amount;
          items.push({
            label: e.label,
            amount,
            transactionDateISO: txIso,
            bankImpactDateISO: impactIso,
            dateISO: impactIso,
            kind: "loan",
            expected: true,
          });
          break;
      }
    }
  }

  // Forward-dated manual cash entries — Phase 336 paymentDate lets
  // the user log a manual expense with chargeDate > now. The curve
  // routes those via card-stream only when paymentMethod === "credit";
  // a cash entry doesn't surface there, so we walk the entry list
  // ourselves to expose it as a "manual expense" line.
  let deltaManualExpenses = 0;
  for (const entry of args.entries) {
    if (entry.isRefund) continue;
    if (entry.excludeFromBudget) continue;
    if (entry.currency && entry.currency !== "ILS") continue;
    if (entry.paymentMethod !== "cash") continue;
    if (entry.bankPending || entry.needsConfirmation) continue;
    const chargeIso = entry.chargeDate ?? entry.createdAt;
    if (!chargeIso) continue;
    const charge = new Date(chargeIso).getTime();
    if (!Number.isFinite(charge)) continue;
    if (charge <= nowTs) continue;
    if (charge > horizonTs) continue;
    const amount = Math.max(0, Math.abs(entry.amount));
    deltaManualExpenses += amount;
    items.push({
      label: entry.merchant || entry.note || "הוצאה ידנית",
      amount,
      transactionDateISO: new Date(chargeIso).toISOString(),
      bankImpactDateISO: new Date(chargeIso).toISOString(),
      dateISO: new Date(chargeIso).toISOString(),
      kind: "manual_expense",
      expected: true,
    });
  }

  items.sort((a, b) =>
    a.bankImpactDateISO.localeCompare(b.bankImpactDateISO),
  );

  // Count entries the engine excluded from the projection so the
  // explain panel can warn the user transparently.
  let excludedPendingCount = 0;
  let excludedPendingTotal = 0;
  for (const entry of args.entries) {
    if (!entry.bankPending && !entry.needsConfirmation) continue;
    if (entry.confirmedAt) continue; // already counted via the curve.
    const charge = new Date(entry.chargeDate).getTime();
    if (charge < nowTs) continue;
    if (charge > horizonTs) continue;
    excludedPendingCount++;
    excludedPendingTotal += Math.max(0, entry.amount ?? 0);
  }

  return {
    whenISO: target.whenISO,
    startingBalance: round2(startingBalance),
    income: round2(deltaIncome),
    cardSettlements: round2(deltaCreditCards),
    bankFixed: round2(deltaBankFixed),
    loans: round2(deltaLoans),
    manualExpenses: round2(deltaManualExpenses),
    deltaIncome: round2(deltaIncome),
    deltaCreditCards: round2(deltaCreditCards),
    deltaBankFixedCharges: round2(deltaBankFixed),
    deltaLoans: round2(deltaLoans),
    deltaManualExpenses: round2(deltaManualExpenses),
    finalBalance: round2(target.balance),
    projectedBalance: round2(target.balance),
    includedItems: items,
    excludedPendingCount,
    excludedPendingTotal: round2(excludedPendingTotal),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
