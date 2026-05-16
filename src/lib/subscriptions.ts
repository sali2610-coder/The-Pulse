// Subscription radar.
//
// Heuristic that scans the entries log for merchants that have charged the
// user at least N times across distinct months with a stable amount. If
// no recurring rule already covers that merchant/category pair, the
// dashboard radar card surfaces it as a one-tap "add as rule" suggestion.
//
// The PRD calls this out as "users should not manually rebuild their
// financial state every month" — Sally should learn the pattern.

import type {
  ExpenseEntry,
  RecurringRule,
} from "@/types/finance";
import type { CategoryId } from "@/lib/categories";
import { merchantKey } from "@/lib/sanitize";
import { monthKeyOf } from "@/lib/dates";

/** Minimum distinct months a pattern must show up in. Three months is the
 *  smallest sample size that distinguishes "real subscription" from a
 *  coincidence (e.g. eating at the same café two months in a row). */
const MIN_OBSERVATIONS = 3;
/** Charges in the same pattern must stay within ±15% of the median amount.
 *  Looser than the matching tolerance (25%) — subscriptions tend to be very
 *  stable; variable bills already have a manual rule. */
const AMOUNT_BAND = 0.15;
/** Don't propose a pattern for amounts below this — too noisy. */
const MIN_AMOUNT = 5;

export type SubscriptionCandidate = {
  /** Stable identifier used for de-duping the same pattern across renders. */
  key: string;
  merchant: string;
  category: CategoryId;
  /** Median observed amount — what we'll seed the rule's estimatedAmount with. */
  estimatedAmount: number;
  /** Most common day-of-month across observations. */
  dayOfMonth: number;
  /** Number of distinct months we've seen this charge in. */
  observations: number;
  /** Entry IDs that contributed — kept so the UI can drill down. */
  entryIds: string[];
  /** Suggested keyword list to seed RecurringRule.keywords[]. */
  keywords: string[];
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function mode<T>(values: T[]): T | undefined {
  if (values.length === 0) return undefined;
  const counts = new Map<T, number>();
  let best: T | undefined;
  let bestCount = 0;
  for (const v of values) {
    const next = (counts.get(v) ?? 0) + 1;
    counts.set(v, next);
    if (next > bestCount) {
      bestCount = next;
      best = v;
    }
  }
  return best;
}

function withinBand(values: number[], med: number): boolean {
  if (med <= 0) return false;
  return values.every((v) => Math.abs(v - med) / med <= AMOUNT_BAND);
}

/**
 * Returns candidate subscriptions sorted by confidence (observations desc,
 * then amount desc). Already-covered merchants (by exact key match against
 * existing rule labels/keywords or label substring) are skipped.
 */
export function detectSubscriptionCandidates(args: {
  entries: ExpenseEntry[];
  rules: RecurringRule[];
}): SubscriptionCandidate[] {
  // Build a quick lookup of merchant keys that a rule already covers, so we
  // don't surface a pattern the user already wrote a rule for.
  const coveredKeys = new Set<string>();
  for (const rule of args.rules) {
    const labelKey = merchantKey(rule.label);
    if (labelKey) coveredKeys.add(labelKey);
    for (const kw of rule.keywords) {
      const k = merchantKey(kw);
      if (k) coveredKeys.add(k);
    }
  }

  // Group entries by (merchantKey, category) — both axes matter because the
  // same merchant could appear under different categories for different
  // products (rare, but supports it).
  type Bucket = {
    merchant: string;
    category: CategoryId;
    months: Set<string>;
    amounts: number[];
    days: number[];
    entryIds: string[];
  };
  const buckets = new Map<string, Bucket>();

  for (const entry of args.entries) {
    if (entry.amount < MIN_AMOUNT) continue;
    if (entry.isRefund) continue;
    if (entry.needsConfirmation) continue;
    const m = entry.merchant?.trim();
    if (!m) continue;
    const key = merchantKey(m);
    if (!key) continue;
    if (coveredKeys.has(key)) continue;

    const bucketKey = `${key}|${entry.category}`;
    const bucket = buckets.get(bucketKey) ?? {
      merchant: m,
      category: entry.category,
      months: new Set<string>(),
      amounts: [],
      days: [],
      entryIds: [],
    };
    const date = new Date(entry.chargeDate);
    bucket.months.add(monthKeyOf(date));
    // Use the *slice* amount (per-month) for installment entries so a 12×
    // installment doesn't look like a "subscription" of the full amount.
    const sliceAmount = entry.installments > 1
      ? entry.amount / entry.installments
      : entry.amount;
    bucket.amounts.push(sliceAmount);
    bucket.days.push(date.getDate());
    bucket.entryIds.push(entry.id);
    buckets.set(bucketKey, bucket);
  }

  const candidates: SubscriptionCandidate[] = [];
  for (const [key, bucket] of buckets) {
    if (bucket.months.size < MIN_OBSERVATIONS) continue;
    const med = median(bucket.amounts);
    if (!withinBand(bucket.amounts, med)) continue;
    const day = mode(bucket.days) ?? 1;
    candidates.push({
      key,
      merchant: bucket.merchant,
      category: bucket.category,
      estimatedAmount: Math.round(med * 100) / 100,
      dayOfMonth: day,
      observations: bucket.months.size,
      entryIds: bucket.entryIds,
      keywords: [bucket.merchant],
    });
  }

  candidates.sort((a, b) => {
    if (b.observations !== a.observations) {
      return b.observations - a.observations;
    }
    return b.estimatedAmount - a.estimatedAmount;
  });
  return candidates;
}
