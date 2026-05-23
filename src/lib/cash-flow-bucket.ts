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
import { ruleSchedule } from "@/lib/installment-schedule";
import {
  effectiveCashImpactForRule,
  effectiveCashImpactStream,
} from "@/lib/effective-cash-date";

export type BucketSource = "card" | "loan" | "bank_debit";

export type BucketObligation = {
  label: string;
  amount: number;
  /** ISO of when this individual obligation hits. */
  effectiveCashAt: string;
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
      const impact = effectiveCashImpactForRule({
        rule,
        accounts: args.accounts,
        monthKey,
      });
      if (!impact) continue;
      const ts = impact.effectiveCashDate.getTime();
      if (ts <= now.getTime() || ts > horizon.getTime()) continue;
      const bucketId =
        impact.kind === "card" && impact.viaCardId
          ? `card:${impact.viaCardId}`
          : bankBucketId;
      const bucket = ensureBucket(bucketId, () =>
        impact.kind === "card" && impact.viaCardId
          ? cardBucketFor(impact.viaCardId, args.accounts)
          : bankBucket(),
      );
      pushObligation(bucket, {
        label: rule.label,
        amount: impact.amount,
        effectiveCashAt: impact.effectiveCashDate.toISOString(),
        kind: rule.installmentTotal ? "installment" : "recurring",
        refId: rule.id,
      });
    }
  }

  // 2. Loans — one bucket each. dayOfMonth drives the debit.
  for (const loan of args.loans) {
    if (!loan.active) continue;
    for (const monthKey of monthsInWindow(now, horizon)) {
      const date = dateOfMonth(monthKey, loan.dayOfMonth);
      if (date.getTime() <= now.getTime()) continue;
      if (date.getTime() > horizon.getTime()) continue;
      const bucketId = `loan:${loan.id}`;
      const bucket = ensureBucket(bucketId, () => loanBucketFor(loan));
      pushObligation(bucket, {
        label: loan.label,
        amount: loan.monthlyInstallment,
        effectiveCashAt: date.toISOString(),
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
    if (!impact.viaCardId) continue;
    const ts = impact.effectiveCashDate.getTime();
    if (ts <= now.getTime() || ts > horizon.getTime()) continue;
    const bucketId = `card:${impact.viaCardId}`;
    const bucket = ensureBucket(bucketId, () =>
      cardBucketFor(impact.viaCardId!, args.accounts),
    );
    pushObligation(bucket, {
      label: pickEntryLabel(args.entries, impact),
      amount: impact.amount,
      effectiveCashAt: impact.effectiveCashDate.toISOString(),
      kind: "card_entry",
      refId: `entry:${impact.viaCardId}:${ts}`,
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
