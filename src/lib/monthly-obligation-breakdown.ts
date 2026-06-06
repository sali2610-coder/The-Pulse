// Phase 370 — Monthly Obligation Cockpit canonical breakdown.
//
// Single source of truth for "what's leaving me this month, by where
// it comes out." Classifies every monthly outflow into exactly ONE of
// four lanes:
//
//   CREDIT_CARDS  rules card-settled this month
//                 + entry slices charging the card this month
//                 + card-linked installment plans
//   BANK_FIXED    rules bank/unknown-paid not card-settled
//                 (the canonical "fixedMonthly" surface)
//   LOANS         active loan installments scheduled for this month
//   CASH          rules paymentSource="cash"
//                 + manual withdrawal entries dated this month
//
// Invariants (pinned by tests):
//   • Every rule.id / loan.id / entry.id appears in AT MOST one lane.
//   • Total = creditCardsTotal + bankFixedTotal + loansTotal + cashTotal.
//   • Card-settled rules NEVER count toward BANK_FIXED.
//   • Card-routed expense entries NEVER count toward BANK_FIXED.
//   • Loans always count as LOANS — paymentSource is intentionally
//     ignored on loans (the model has no paymentSource on Loan).
//
// Engine math untouched — this helper only RECLASSIFIES existing
// store data.

import type {
  ExpenseEntry,
  Loan,
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import { loanSchedule, ruleSchedule } from "@/lib/installment-schedule";
import { isRuleCardSettled } from "@/lib/rule-settlement";
import { sliceForMonth } from "@/lib/projections";
import { getCreditCardExposure } from "@/lib/credit-card-exposure";

export type ObligationLane =
  | "creditCards"
  | "bankFixed"
  | "loans"
  | "cash";

export type ObligationRow = {
  id: string;
  lane: ObligationLane;
  label: string;
  amount: number;
  kind: "rule" | "loan" | "entry" | "withdrawal";
  /** Phase 398 — ISO date of the underlying obligation so the cockpit
   *  rows can render the day alongside the amount. Manual entries
   *  carry their slice.chargeDate; rules use dayOfMonth-of-monthKey;
   *  loans use loan.dayOfMonth-of-monthKey. Optional for legacy
   *  fixtures that haven't been updated yet. */
  chargeDate?: string;
};

export type MonthlyObligationBreakdown = {
  monthKey: MonthKey;
  total: number;
  creditCardsTotal: number;
  bankFixedTotal: number;
  loansTotal: number;
  cashTotal: number;
  counts: {
    creditCards: number;
    bankFixed: number;
    loans: number;
    cash: number;
  };
  /** Number of items that would have been double-counted under naive
   *  rules (e.g. rule with paymentSource="card" AND matching housing
   *  bucket). Kept for debug + UI affordance ("X duplicates prevented"). */
  duplicatesPrevented: number;
  explanationRows: ObligationRow[];
};

function isWithdrawalThisMonth(
  entry: ExpenseEntry,
  monthKey: MonthKey,
): boolean {
  if (entry.transactionType !== "withdrawal") return false;
  if (entry.isRefund) return false;
  if (entry.excludeFromBudget) return false;
  // Slice math reuses sliceForMonth so cash withdrawals split over
  // installments still count proportionally.
  const slice = sliceForMonth(entry, monthKey);
  return slice !== null;
}

function withdrawalSliceFor(
  entry: ExpenseEntry,
  monthKey: MonthKey,
): number {
  const slice = sliceForMonth(entry, monthKey);
  return slice ? Math.abs(slice.amount) : 0;
}

// Phase 397 — manual cash purchases (paymentMethod="cash" + not
// withdrawal) belong in the cash lane. Previously they fell through
// every lane: the credit-lane "תיעוד ידני" tile only saw credit
// manuals, and the cash lane only saw withdrawals + cash-rules.
// Result: a ₪10 σόπer cash entry was visible in the donut + "לאן
// הולך הכסף" but invisible to the cockpit, producing the user-
// reported ₪10 drift between the four surfaces.
function isManualCashThisMonth(
  entry: ExpenseEntry,
  monthKey: MonthKey,
): boolean {
  if (entry.paymentMethod !== "cash") return false;
  if (entry.transactionType === "withdrawal") return false;
  if (entry.isRefund) return false;
  if (entry.excludeFromBudget) return false;
  if (entry.needsConfirmation && !entry.confirmedAt) return false;
  if (entry.bankPending) return false;
  if (entry.currency && entry.currency !== "ILS") return false;
  const slice = sliceForMonth(entry, monthKey);
  return slice !== null;
}

function manualCashSliceFor(
  entry: ExpenseEntry,
  monthKey: MonthKey,
): number {
  const slice = sliceForMonth(entry, monthKey);
  return slice ? Math.abs(slice.amount) : 0;
}

function dateOfMonth(monthKey: MonthKey, dayOfMonth: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const day = Math.min(Math.max(1, dayOfMonth), lastDay);
  return new Date(y, m - 1, day, 12, 0, 0).toISOString();
}

export function getMonthlyObligationBreakdown(args: {
  rules: RecurringRule[];
  loans: Loan[];
  entries: ExpenseEntry[];
  /** Phase 377 — required so the credit lane can be delegated to
   *  getCreditCardExposure (which respects paid-status filters).
   *  Without statuses the breakdown would silently differ from the
   *  cockpit's canonical credit total. */
  statuses: RecurringStatus[];
  monthKey: MonthKey;
}): MonthlyObligationBreakdown {
  const seen = new Set<string>();
  let duplicatesPrevented = 0;
  const rows: ObligationRow[] = [];
  let bankFixedTotal = 0;
  let loansTotal = 0;
  let cashTotal = 0;
  let bankCount = 0;
  let loanCount = 0;
  let cashCount = 0;

  // ─── Credit cards — delegated to the canonical exposure helper.
  //
  // Phase 377 — the cockpit's "אשראי" tile and the Credit Cards
  // section MUST show the same number. We achieve that by routing
  // ALL credit accounting through getCreditCardExposure here: rules
  // card-settled this month + every credit entry slice (manual /
  // wallet / sms / imported / installments / pending) deduped via
  // its internal seen set. Total + rows are imported verbatim so
  // the obligation cockpit cannot diverge.
  const exposure = getCreditCardExposure({
    rules: args.rules,
    entries: args.entries,
    statuses: args.statuses,
    monthKey: args.monthKey,
  });
  const creditCardsTotal = exposure.totalExpectedCharge;
  let creditCount = 0;
  for (const row of exposure.breakdown) {
    seen.add(row.id);
    creditCount += 1;
    rows.push({
      id: row.id,
      lane: "creditCards",
      label: row.label,
      amount: row.amount,
      kind: row.kind,
    });
  }
  duplicatesPrevented += exposure.duplicatesPrevented;

  // ─── Recurring rules — bank + cash ─────────────────────────────
  // Card-settled rules already counted via exposure above; the rule
  // loop here only fans out the non-card lanes.
  for (const r of args.rules) {
    if (!r.active) continue;
    if (!ruleSchedule(r, args.monthKey).active) continue;
    if (isRuleCardSettled(r)) continue; // already in exposure
    const id = `rule:${r.id}`;
    if (seen.has(id)) {
      duplicatesPrevented += 1;
      continue;
    }
    seen.add(id);
    const ruleChargeDate = dateOfMonth(args.monthKey, r.dayOfMonth);

    if (r.paymentSource === "cash") {
      cashTotal += r.estimatedAmount;
      cashCount += 1;
      rows.push({
        id,
        lane: "cash",
        label: r.label,
        amount: r.estimatedAmount,
        kind: "rule",
        chargeDate: ruleChargeDate,
      });
      continue;
    }
    bankFixedTotal += r.estimatedAmount;
    bankCount += 1;
    rows.push({
      id,
      lane: "bankFixed",
      label: r.label,
      amount: r.estimatedAmount,
      kind: "rule",
      chargeDate: ruleChargeDate,
    });
  }

  // ─── Loans ──────────────────────────────────────────────────────
  for (const l of args.loans) {
    if (!l.active) continue;
    if (!loanSchedule(l, args.monthKey).active) continue;
    const id = `loan:${l.id}`;
    if (seen.has(id)) {
      duplicatesPrevented += 1;
      continue;
    }
    seen.add(id);
    loansTotal += l.monthlyInstallment;
    loanCount += 1;
    rows.push({
      id,
      lane: "loans",
      label: l.label,
      amount: l.monthlyInstallment,
      kind: "loan",
      chargeDate: dateOfMonth(args.monthKey, l.dayOfMonth),
    });
  }

  // ─── Manual cash withdrawals dated this month ──────────────────
  for (const e of args.entries) {
    if (!isWithdrawalThisMonth(e, args.monthKey)) continue;
    const id = `entry:${e.id}`;
    if (seen.has(id)) {
      duplicatesPrevented += 1;
      continue;
    }
    seen.add(id);
    const amount = withdrawalSliceFor(e, args.monthKey);
    cashTotal += amount;
    cashCount += 1;
    rows.push({
      id,
      lane: "cash",
      label: e.merchant ?? e.note ?? "משיכה",
      amount,
      kind: "withdrawal",
      chargeDate: sliceForMonth(e, args.monthKey)?.chargeDate.toISOString(),
    });
  }

  // ─── Manual cash purchases dated this month (Phase 397) ────────
  // Closes the data hole that produced the ₪10 cockpit ↔ donut
  // mismatch. paymentMethod="cash" expenses now appear in the cash
  // lane breakdown alongside withdrawals + cash-rules.
  for (const e of args.entries) {
    if (!isManualCashThisMonth(e, args.monthKey)) continue;
    const id = `entry:${e.id}`;
    if (seen.has(id)) {
      duplicatesPrevented += 1;
      continue;
    }
    seen.add(id);
    const amount = manualCashSliceFor(e, args.monthKey);
    cashTotal += amount;
    cashCount += 1;
    rows.push({
      id,
      lane: "cash",
      label: e.merchant ?? e.note ?? "תיעוד מזומן",
      amount,
      kind: "entry",
      chargeDate: sliceForMonth(e, args.monthKey)?.chargeDate.toISOString(),
    });
  }

  // Phase 396 — RAW floats. UI rounds at display only. Single
  // rounding strategy across the engine eliminates per-surface drift.
  return {
    monthKey: args.monthKey,
    total: creditCardsTotal + bankFixedTotal + loansTotal + cashTotal,
    creditCardsTotal,
    bankFixedTotal,
    loansTotal,
    cashTotal,
    counts: {
      creditCards: creditCount,
      bankFixed: bankCount,
      loans: loanCount,
      cash: cashCount,
    },
    duplicatesPrevented,
    explanationRows: rows,
  };
}
