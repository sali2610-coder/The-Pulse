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
    if (!amountClose(entry.amount, candidate.amount)) continue;
    if (dateDeltaDays(entry.chargeDate, candidate.chargeDate) > DAY_TOLERANCE_DAYS)
      continue;
    // If both sides know which account, they must agree. Different accounts
    // legitimately produce identical-looking charges (e.g. two cards at the
    // same merchant on the same day).
    if (
      candidate.accountId &&
      entry.accountId &&
      candidate.accountId !== entry.accountId
    ) {
      continue;
    }
    // If both sides have card last4 and they disagree → not a match.
    if (
      candidate.cardLast4 &&
      entry.cardLast4 &&
      candidate.cardLast4 !== entry.cardLast4
    ) {
      continue;
    }
    if (!merchantsMatch(candidate.merchant, entry.merchant)) continue;
    return entry;
  }
  return undefined;
}
