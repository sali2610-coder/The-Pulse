// Phase 208 — per-source obligation buckets.
//
// Replaces the conceptually-wrong "fixed expenses total". Every
// upcoming obligation routes into the bucket whose settlement
// date drives the real liquidity hit:
//
//   - one bucket per ACTIVE credit card (Isracard / MAX / Cal …)
//   - one bucket per ACTIVE loan
//   - one bucket "Direct bank debits" for non-card recurring rules
//
// Each bucket reports:
//   * monthlyTotal       sum of in-window obligations
//   * nextSettlementAt   next ISO date the bucket debits
//   * obligationCount    rows that contribute
//   * obligations[]      itemized list (label, amount, source-kind)
//
// Pure. No store, no React. Reuses effectiveCashImpactForRule +
// effective-cash-date stream for entries so the cash-date math
// stays single-sourced.

import type {
  Account,
  ExpenseEntry,
  Loan,
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import { addMonths, monthKeyOf } from "@/lib/dates";
import { loanSchedule, ruleSchedule } from "@/lib/installment-schedule";
import {
  effectiveCashImpactForRule,
  effectiveCashImpactStream,
} from "@/lib/effective-cash-date";
import {
  isRuleCovered,
  monthsCoveredByMatchedEntries,
} from "@/lib/rule-coverage";

export type BucketSource = "card" | "loan" | "bank_debit";

export type BucketObligation = {
  label: string;
  amount: number;
  /** ISO of when this individual obligation hits the bank. */
  effectiveCashAt: string;
  /** Phase 347 — ISO of when the underlying transaction actually
   *  happened. For card purchases this is the buy date; for bank
   *  debits / loans / cash entries it equals effectiveCashAt
   *  (transaction date and bank-impact date are the same).
   *  Optional so legacy fixtures still typecheck — consumers fall
   *  back to effectiveCashAt when unset. */
  transactionAt?: string;
  kind: "recurring" | "installment" | "loan" | "card_entry";
  refId: string;
};

export type CashFlowBucket = {
  id: string;
  /** Hebrew display label. */
  label: string;
  source: BucketSource;
  /** Sum of every contributing obligation inside the window. */
  monthlyTotal: number;
  /** ISO of the next future settlement, or null when nothing is queued. */
  nextSettlementAt: string | null;
  obligationCount: number;
  obligations: BucketObligation[];
  /** Optional metadata — card-specific. */
  cardId?: string;
  cardLast4?: string;
  /** Optional metadata — loan-specific. */
  loanId?: string;
};

export type CashFlowBucketsReport = {
  buckets: CashFlowBucket[];
  windowStart: string;
  windowEnd: string;
  /** Sum of every bucket's monthlyTotal. Useful as a sanity check. */
  totalCommitted: number;
};

const WINDOW_DAYS = 35;

export function buildCashFlowBuckets(args: {
  accounts: Account[];
  loans: Loan[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  entries: ExpenseEntry[];
  now?: Date;
  /** How far forward to project. Default 35 days. */
  windowDays?: number;
}): CashFlowBucketsReport {
  const now = args.now ?? new Date();
  const horizon = new Date(
    now.getTime() + Math.max(1, args.windowDays ?? WINDOW_DAYS) * 86_400_000,
  );

  const buckets = new Map<string, CashFlowBucket>();
  const bankBucketId = "bank_debit";

  const ensureBucket = (
    id: string,
    init: () => CashFlowBucket,
  ): CashFlowBucket => {
    const found = buckets.get(id);
    if (found) return found;
    const fresh = init();
    buckets.set(id, fresh);
    return fresh;
  };

  // 1. Recurring rules — route via effectiveCashImpactForRule.
  const paidThisMonth = new Set(
    args.statuses
      .filter(
        (s) =>
          s.status === "paid" &&
          s.monthKey === monthKeyOf(now),
      )
      .map((s) => s.ruleId),
  );
  // Phase 262 — skip a rule for ANY month that's already covered by
  // a matched entry slice. Without this guard the cash-flow buckets
  // emit both the rule's expected amount AND the entry's slice for
  // future months — most painfully on installment plans.
  const coverage = monthsCoveredByMatchedEntries({
    rules: args.rules,
    entries: args.entries,
    now,
    windowDays: args.windowDays ?? WINDOW_DAYS,
  });
  for (const rule of args.rules) {
    if (!rule.active) continue;
    // Evaluate the rule across the months the window spans.
    for (const monthKey of monthsInWindow(now, horizon)) {
      if (!ruleSchedule(rule, monthKey).active) continue;
      if (
        monthKey === monthKeyOf(now) &&
        paidThisMonth.has(rule.id)
      ) {
        continue;
      }
      if (isRuleCovered(coverage, rule.id, monthKey)) continue;
      const impact = effectiveCashImpactForRule({
        rule,
        accounts: args.accounts,
        monthKey,
      });
      if (!impact) continue;
      const ts = impact.effectiveCashDate.getTime();
      if (ts <= now.getTime() || ts > horizon.getTime()) continue;
      // Phase 388 — card-settled rules with NO resolved card go to a
      // synthetic "card:__unassigned__" bucket instead of being
      // silently misrouted to the bank lane. Keeps the canonical
      // exposure total intact across every downstream surface.
      let bucketId: string;
      let bucketFactory: () => CashFlowBucket;
      if (impact.kind === "card") {
        if (impact.viaCardId) {
          bucketId = `card:${impact.viaCardId}`;
          bucketFactory = () =>
            cardBucketFor(impact.viaCardId!, args.accounts);
        } else {
          bucketId = `card:${UNASSIGNED_CARD_ID}`;
          bucketFactory = unassignedCardBucket;
        }
      } else {
        bucketId = bankBucketId;
        bucketFactory = bankBucket;
      }
      const bucket = ensureBucket(bucketId, bucketFactory);
      pushObligation(bucket, {
        label: rule.label,
        amount: impact.amount,
        effectiveCashAt: impact.effectiveCashDate.toISOString(),
        transactionAt: impact.ruleDate.toISOString(),
        kind: rule.installmentTotal ? "installment" : "recurring",
        refId: rule.id,
      });
    }
  }

  // 2. Loans — one bucket each. dayOfMonth drives the debit.
  //
  // Phase 343 — `loanSchedule(loan, monthKey).active` gate added.
  // Before this gate, a loan with a finite installment plan that had
  // already completed (or hadn't started yet) still emitted an
  // obligation each calendar month the window touched, and a loan
  // with dayOfMonth ≤ horizon's day fired in BOTH calendar months
  // when the window spanned a rollover — so a "10 לחודש הבא"
  // forecast with an active dayOfMonth-5 loan counted that loan
  // twice (current month + next month). The schedule check makes
  // the emission idempotent per active month, matching the loans
  // panel total.
  for (const loan of args.loans) {
    if (!loan.active) continue;
    for (const monthKey of monthsInWindow(now, horizon)) {
      if (!loanSchedule(loan, monthKey).active) continue;
      const date = dateOfMonth(monthKey, loan.dayOfMonth);
      if (date.getTime() <= now.getTime()) continue;
      if (date.getTime() > horizon.getTime()) continue;
      const bucketId = `loan:${loan.id}`;
      const bucket = ensureBucket(bucketId, () => loanBucketFor(loan));
      pushObligation(bucket, {
        label: loan.label,
        amount: loan.monthlyInstallment,
        effectiveCashAt: date.toISOString(),
        transactionAt: date.toISOString(),
        kind: "loan",
        refId: loan.id,
      });
    }
  }

  // 3. Future card-entry slices (installment plans + scheduled one-shots).
  const stream = effectiveCashImpactStream({
    entries: args.entries,
    accounts: args.accounts,
    now,
  });
  for (const impact of stream) {
    if (impact.kind !== "card") continue;
    const ts = impact.effectiveCashDate.getTime();
    if (ts <= now.getTime() || ts > horizon.getTime()) continue;
    // Phase 388 — accept impacts even when no card account resolves.
    // Synthetic "card:__unassigned__" bucket keeps the curve total
    // aligned with the canonical Expenses-cockpit credit total.
    const viaCardId = impact.viaCardId ?? UNASSIGNED_CARD_ID;
    const bucketId = `card:${viaCardId}`;
    const bucket = ensureBucket(bucketId, () =>
      impact.viaCardId
        ? cardBucketFor(impact.viaCardId, args.accounts)
        : unassignedCardBucket(),
    );
    pushObligation(bucket, {
      label: pickEntryLabel(args.entries, impact),
      amount: impact.amount,
      effectiveCashAt: impact.effectiveCashDate.toISOString(),
      transactionAt: impact.purchaseDate.toISOString(),
      kind: "card_entry",
      refId: `entry:${viaCardId}:${ts}`,
    });
  }

  // Finalise buckets — sort obligations + compute totals + next date.
  const finalBuckets: CashFlowBucket[] = [];
  for (const b of buckets.values()) {
    b.obligations.sort(
      (a, b2) =>
        new Date(a.effectiveCashAt).getTime() -
        new Date(b2.effectiveCashAt).getTime(),
    );
    b.monthlyTotal = round2(
      b.obligations.reduce((acc, o) => acc + o.amount, 0),
    );
    b.obligationCount = b.obligations.length;
    b.nextSettlementAt = b.obligations[0]?.effectiveCashAt ?? null;
    finalBuckets.push(b);
  }

  // Sort buckets by next settlement (soonest first), then by source
  // for stability.
  finalBuckets.sort((a, b) => {
    const at = a.nextSettlementAt ? new Date(a.nextSettlementAt).getTime() : Infinity;
    const bt = b.nextSettlementAt ? new Date(b.nextSettlementAt).getTime() : Infinity;
    if (at !== bt) return at - bt;
    return a.id.localeCompare(b.id);
  });

  return {
    buckets: finalBuckets,
    windowStart: now.toISOString(),
    windowEnd: horizon.toISOString(),
    totalCommitted: round2(
      finalBuckets.reduce((acc, b) => acc + b.monthlyTotal, 0),
    ),
  };
}

// ────────────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────────────

function pushObligation(
  bucket: CashFlowBucket,
  obligation: BucketObligation,
): void {
  bucket.obligations.push(obligation);
}

function cardBucketFor(cardId: string, accounts: Account[]): CashFlowBucket {
  const card = accounts.find((a) => a.id === cardId);
  return {
    id: `card:${cardId}`,
    label: card?.label ?? `····${card?.cardLast4 ?? cardId.slice(0, 4)}`,
    source: "card",
    monthlyTotal: 0,
    nextSettlementAt: null,
    obligationCount: 0,
    obligations: [],
    cardId,
    cardLast4: card?.cardLast4,
  };
}

// Phase 388 — synthetic "card with no resolved account" bucket.
// Previously, credit impacts (rules + entries) without a viaCardId
// were silently dropped from the curve OR misrouted to the bank
// bucket. Result: Time-screen forecast deducted less than the
// canonical Expenses-cockpit credit total. Every credit shekel must
// still appear on the curve.
const UNASSIGNED_CARD_ID = "__unassigned__";
function unassignedCardBucket(): CashFlowBucket {
  return {
    id: `card:${UNASSIGNED_CARD_ID}`,
    label: "אשראי ללא כרטיס מוגדר",
    source: "card",
    monthlyTotal: 0,
    nextSettlementAt: null,
    obligationCount: 0,
    obligations: [],
    cardId: UNASSIGNED_CARD_ID,
  };
}

function loanBucketFor(loan: Loan): CashFlowBucket {
  return {
    id: `loan:${loan.id}`,
    label: loan.label,
    source: "loan",
    monthlyTotal: 0,
    nextSettlementAt: null,
    obligationCount: 0,
    obligations: [],
    loanId: loan.id,
  };
}

function bankBucket(): CashFlowBucket {
  return {
    id: "bank_debit",
    label: "הוראות קבע ישירות מהבנק",
    source: "bank_debit",
    monthlyTotal: 0,
    nextSettlementAt: null,
    obligationCount: 0,
    obligations: [],
  };
}

function* monthsInWindow(from: Date, to: Date): Generator<MonthKey> {
  const seen = new Set<MonthKey>();
  let cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  while (cursor.getTime() <= to.getTime() + 32 * 86_400_000) {
    const mk: MonthKey = monthKeyOf(cursor);
    if (!seen.has(mk)) {
      seen.add(mk);
      yield mk;
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  // Belt and braces — make sure addMonths reaches at least one slot
  // beyond horizon for cards whose paymentDay rolls month boundaries.
  const overflow = addMonths(monthKeyOf(to), 1);
  if (!seen.has(overflow)) yield overflow;
}

function dateOfMonth(monthKey: MonthKey, dayOfMonth: number): Date {
  const [y, m] = monthKey.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const day = Math.min(Math.max(1, dayOfMonth), lastDay);
  return new Date(y, m - 1, day, 12, 0, 0);
}

function pickEntryLabel(
  entries: ExpenseEntry[],
  impact: { viaCardId?: string; effectiveCashDate: Date; amount: number },
): string {
  // Best effort — drilldown UI keeps richer detail. Here we just want
  // a recognisable bucket-row label.
  const match = entries.find(
    (e) =>
      e.installments > 0 &&
      Math.abs(
        new Date(e.chargeDate).getTime() -
          impact.effectiveCashDate.getTime(),
      ) < 60 * 86_400_000,
  );
  if (match?.merchant) return match.merchant;
  if (match?.note) return match.note;
  return "חיוב כרטיס";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
