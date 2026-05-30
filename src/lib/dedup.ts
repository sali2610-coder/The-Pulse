// Cross-source de-duplication.
//
// The same physical charge can land in the store via two paths:
//  1. SMS arrives in seconds → webhook → addExpense({ source: "auto" }) with
//     externalId based on the SMS body hash.
//  2. User imports the monthly statement CSV → addExpense({ source: "auto" })
//     with externalId `import:<issuer>:<date>:<amount>:<merchant>`.
//
// Those two externalIds will never match, so we need a fuzzy comparator that
// matches on (date ±2 days, amount ±1₪/±1%, normalized merchant).

import type { ExpenseEntry } from "@/types/finance";
import { merchantKey } from "@/lib/sanitize";

const DAY_TOLERANCE_DAYS = 2;
const AMOUNT_FLOOR = 1.0; // ₪ — small charges always need exact match
const AMOUNT_PCT = 0.01; // ±1% for larger ones

export type FuzzyCandidate = {
  amount: number;
  chargeDate: string;
  merchant?: string;
  cardLast4?: string;
  /** When the candidate is bound to an Account, refuse to merge it into an
   *  entry that's already bound to a *different* Account. Two banks/cards
   *  legitimately can charge the same merchant for similar amounts. */
  accountId?: string;
};

function dateDeltaDays(aIso: string, bIso: string): number {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return Infinity;
  return Math.abs(a - b) / (1000 * 60 * 60 * 24);
}

function amountClose(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  if (diff === 0) return true;
  // Always allow ±1₪ tolerance to absorb cash-handling rounding.
  if (diff <= AMOUNT_FLOOR) return true;
  const pct = diff / Math.max(a, b);
  return pct <= AMOUNT_PCT;
}

function merchantsMatch(
  candidate: string | undefined,
  existing: string | undefined,
): boolean {
  if (!candidate || !existing) return true; // missing data → don't block
  const a = merchantKey(candidate);
  const b = merchantKey(existing);
  if (!a || !b) return true;
  if (a === b) return true;
  // Tolerate one side being a prefix/contained — often happens when one
  // source truncates branch info.
  return a.includes(b) || b.includes(a);
}

function fuzzyMatches(
  candidate: FuzzyCandidate,
  entry: ExpenseEntry,
): boolean {
  if (!amountClose(entry.amount, candidate.amount)) return false;
  if (dateDeltaDays(entry.chargeDate, candidate.chargeDate) > DAY_TOLERANCE_DAYS) {
    return false;
  }
  if (
    candidate.accountId &&
    entry.accountId &&
    candidate.accountId !== entry.accountId
  ) {
    return false;
  }
  if (
    candidate.cardLast4 &&
    entry.cardLast4 &&
    candidate.cardLast4 !== entry.cardLast4
  ) {
    return false;
  }
  if (!merchantsMatch(candidate.merchant, entry.merchant)) return false;
  // Phase 327 — when NEITHER side carries any identity signal
  // (merchant / cardLast4 / accountId) we can't claim "same charge"
  // from amount + date alone. Two manual ₪1 entries on the same day
  // were silently rejected as duplicates because of this gap.
  const candidateIdentity = Boolean(
    candidate.merchant || candidate.cardLast4 || candidate.accountId,
  );
  const entryIdentity = Boolean(
    entry.merchant || entry.cardLast4 || entry.accountId,
  );
  if (!candidateIdentity && !entryIdentity) return false;
  return true;
}

/**
 * Find an existing entry that's "the same charge" as the candidate. Returns
 * undefined if no match. Used by addExpense as a second-line dedup after
 * exact externalId comparison.
 */
export function findFuzzyDuplicate(
  candidate: FuzzyCandidate,
  existing: ExpenseEntry[],
): ExpenseEntry | undefined {
  for (const entry of existing) {
    if (fuzzyMatches(candidate, entry)) return entry;
  }
  return undefined;
}

/**
 * Find an existing entry that is the same charge as the candidate AND would
 * benefit from being enriched with the candidate's data. Used by addExpense
 * before `findFuzzyDuplicate`: when a Wallet partial sits in the store and a
 * full SMS arrives, we update the existing entry in place rather than
 * blocking the SMS as a duplicate.
 *
 * `richness` counts how many fields the candidate fills in. Higher = better
 * merge target.
 */
export function findMergeTarget(
  candidate: FuzzyCandidate,
  existing: ExpenseEntry[],
): { target: ExpenseEntry; richness: number } | undefined {
  let best: { target: ExpenseEntry; richness: number } | undefined;
  for (const entry of existing) {
    if (!fuzzyMatches(candidate, entry)) continue;
    let richness = 0;
    if (entry.needsConfirmation) richness += 2; // strongest enrichment signal
    if (!entry.merchant && candidate.merchant) richness += 1;
    if (!entry.cardLast4 && candidate.cardLast4) richness += 1;
    if (!entry.accountId && candidate.accountId) richness += 1;
    if (richness === 0) continue;
    if (!best || richness > best.richness) {
      best = { target: entry, richness };
    }
  }
  return best;
}

// Phase 249 — duplicate confidence scoring.
//
// Surfaces "how sure are we?" so the UI can mark a row as "חשוד
// ככפול" without silently dropping it. Score is 0..1; each signal
// contributes a weight. The strongest signal is exact-amount + same
// merchant + same day; weakest is amount-window + missing merchant.

export type DuplicateSignal =
  | "exact-amount"
  | "amount-within-1pct"
  | "amount-within-1ils"
  | "same-merchant"
  | "merchant-prefix"
  | "same-card-last4"
  | "same-account"
  | "same-day"
  | "day-within-2"
  | "matching-external-id";

export type DuplicateConfidence = {
  score: number;
  signals: DuplicateSignal[];
};

export function scoreDuplicateConfidence(
  candidate: FuzzyCandidate & { externalId?: string },
  entry: ExpenseEntry,
): DuplicateConfidence {
  const signals: DuplicateSignal[] = [];
  let score = 0;

  if (candidate.externalId && candidate.externalId === entry.externalId) {
    return { score: 1, signals: ["matching-external-id"] };
  }

  // Hard mismatches → cannot be the same charge.
  if (
    candidate.accountId &&
    entry.accountId &&
    candidate.accountId !== entry.accountId
  ) {
    return { score: 0, signals: [] };
  }
  if (
    candidate.cardLast4 &&
    entry.cardLast4 &&
    candidate.cardLast4 !== entry.cardLast4
  ) {
    return { score: 0, signals: [] };
  }

  // Amount tier.
  const amountDiff = Math.abs(entry.amount - candidate.amount);
  if (amountDiff === 0) {
    signals.push("exact-amount");
    score += 0.35;
  } else if (amountDiff <= AMOUNT_FLOOR) {
    signals.push("amount-within-1ils");
    score += 0.2;
  } else {
    const pct = amountDiff / Math.max(entry.amount, candidate.amount);
    if (pct <= AMOUNT_PCT) {
      signals.push("amount-within-1pct");
      score += 0.15;
    } else {
      return { score: 0, signals };
    }
  }

  // Date tier.
  const dayDelta = dateDeltaDays(entry.chargeDate, candidate.chargeDate);
  if (dayDelta < 0.5) {
    signals.push("same-day");
    score += 0.25;
  } else if (dayDelta <= DAY_TOLERANCE_DAYS) {
    signals.push("day-within-2");
    score += 0.12;
  } else {
    return { score: 0, signals };
  }

  // Merchant tier.
  const a = candidate.merchant ? merchantKey(candidate.merchant) : "";
  const b = entry.merchant ? merchantKey(entry.merchant) : "";
  if (a && b) {
    if (a === b) {
      signals.push("same-merchant");
      score += 0.2;
    } else if (a.includes(b) || b.includes(a)) {
      signals.push("merchant-prefix");
      score += 0.1;
    } else {
      return { score: 0, signals };
    }
  }

  // Account / card binding.
  if (
    candidate.accountId &&
    entry.accountId &&
    candidate.accountId === entry.accountId
  ) {
    signals.push("same-account");
    score += 0.1;
  }
  if (
    candidate.cardLast4 &&
    entry.cardLast4 &&
    candidate.cardLast4 === entry.cardLast4
  ) {
    signals.push("same-card-last4");
    score += 0.1;
  }

  return {
    score: Math.min(1, round2(score)),
    signals,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Phase 249 — runtime scan that flags "חשוד ככפול" rows across the
 *  live entry list. Pairwise quadratic over a bounded window (only
 *  entries within 2 days of each other), so the cost stays linear
 *  in practice. Returns a map from entry id → suspected sibling +
 *  confidence so the UI can mark either side with a badge.
 *
 *  THRESHOLD is the confidence floor for surfacing the warning.
 *  0.7 == "exact-amount AND same-day AND merchant-prefix" or
 *  similar — strong enough to merit human review, not a false-pos. */
export type SuspectedDuplicateMap = Map<
  string,
  { siblingId: string; confidence: number; signals: DuplicateSignal[] }
>;

export function detectSuspectedDuplicates(
  entries: ExpenseEntry[],
  threshold = 0.7,
): SuspectedDuplicateMap {
  const out: SuspectedDuplicateMap = new Map();
  const sorted = entries
    .slice()
    .sort(
      (a, b) =>
        new Date(a.chargeDate).getTime() - new Date(b.chargeDate).getTime(),
    );

  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    if (a.isRefund) continue;
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      if (b.isRefund) continue;
      const dayDelta = dateDeltaDays(a.chargeDate, b.chargeDate);
      if (dayDelta > DAY_TOLERANCE_DAYS) break; // sorted → no later match
      const result = scoreDuplicateConfidence(
        {
          amount: a.amount,
          chargeDate: a.chargeDate,
          merchant: a.merchant,
          cardLast4: a.cardLast4,
          accountId: a.accountId,
          externalId: a.externalId,
        },
        b,
      );
      if (result.score < threshold) continue;
      // Mark BOTH sides so either rendering surface can show the badge.
      const aPrev = out.get(a.id);
      if (!aPrev || result.score > aPrev.confidence) {
        out.set(a.id, {
          siblingId: b.id,
          confidence: result.score,
          signals: result.signals,
        });
      }
      const bPrev = out.get(b.id);
      if (!bPrev || result.score > bPrev.confidence) {
        out.set(b.id, {
          siblingId: a.id,
          confidence: result.score,
          signals: result.signals,
        });
      }
    }
  }
  return out;
}
