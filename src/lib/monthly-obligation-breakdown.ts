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

    if (r.paymentSource === "cash") {
      cashTotal += r.estimatedAmount;
      cashCount += 1;
      rows.push({
        id,
        lane: "cash",
        label: r.label,
        amount: r.estimatedAmount,
        kind: "rule",
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
    });
  }

  const total = creditCardsTotal + bankFixedTotal + loansTotal + cashTotal;

  return {
    monthKey: args.monthKey,
    total: Math.round(total),
    creditCardsTotal: Math.round(creditCardsTotal),
    bankFixedTotal: Math.round(bankFixedTotal),
    loansTotal: Math.round(loansTotal),
    cashTotal: Math.round(cashTotal),
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
