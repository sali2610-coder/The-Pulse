// Subscription / recurring-charge detection.
//
// Scans the user's ingested expense history and surfaces merchants that
// look like monthly subscriptions but aren't yet covered by a
// RecurringRule. Pure derivation; nothing is mutated. Drives the
// "פעימות שזוהו" suggestion card so the user can promote a detected
// pattern to a real rule with one tap.

import type { CategoryId } from "@/lib/categories";
import { merchantKey, sanitizeMerchant } from "@/lib/sanitize";
import type { ExpenseEntry, RecurringRule } from "@/types/finance";

export type SubscriptionCandidate = {
  /** Normalized merchant key — stable across slightly-different SMS strings. */
  merchantKey: string;
  /** Pretty display name (canonical brand if applicable). */
  displayName: string;
  /** Suggested monthly amount — median over recent occurrences. */
  suggestedAmount: number;
  /** Suggested day of month — mode over occurrences (1..31). */
  suggestedDay: number;
  /** Mode category over occurrences. */
  suggestedCategory: CategoryId;
  /** How many qualifying charges fed this candidate. */
  occurrenceCount: number;
  /** Mean inter-charge gap in days. */
  meanGapDays: number;
  /** Heuristic confidence band. */
  confidence: "high" | "medium" | "low";
  /** ExpenseEntry.id list (most recent first) so the UI can show samples. */
  sampleEntryIds: string[];
};

const LOOKBACK_MS = 1000 * 60 * 60 * 24 * 30 * 6;
const MONTHLY_GAP_MIN = 25;
const MONTHLY_GAP_MAX = 35;
const MIN_OCCURRENCES = 3;
const AMOUNT_DRIFT_MAX = 0.25; // stddev / mean

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function mode<T extends string | number>(values: T[]): T | undefined {
  if (values.length === 0) return undefined;
  const tally = new Map<T, number>();
  for (const v of values) tally.set(v, (tally.get(v) ?? 0) + 1);
  let best: T | undefined;
  let bestCount = -1;
  for (const [v, c] of tally) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** True when an active rule already represents this merchant. Heuristic
 *  match on rule.label + rule.keywords against the candidate merchant key. */
function ruleCoversMerchant(rule: RecurringRule, mKey: string): boolean {
  if (!rule.active) return false;
  const labelKey = merchantKey(rule.label);
  if (labelKey && (labelKey === mKey || labelKey.includes(mKey) || mKey.includes(labelKey))) {
    return true;
  }
  for (const kw of rule.keywords) {
    const k = merchantKey(kw);
    if (k && (k === mKey || k.includes(mKey) || mKey.includes(k))) {
      return true;
    }
  }
  return false;
}

export function detectSubscriptionCandidates(args: {
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  now?: Date;
}): SubscriptionCandidate[] {
  const now = (args.now ?? new Date()).getTime();
  const cutoff = now - LOOKBACK_MS;

  // 1. Filter: only ingested entries with a merchant, not refunds, recent.
  type Sample = {
    entry: ExpenseEntry;
    chargeMs: number;
    day: number;
  };
  const buckets = new Map<string, { display: string; samples: Sample[] }>();
  for (const e of args.entries) {
    if (e.isRefund) continue;
    if (e.source === "manual") continue;
    if (!e.merchant) continue;
    const chargeMs = new Date(e.chargeDate).getTime();
    if (!Number.isFinite(chargeMs)) continue;
    if (chargeMs < cutoff) continue;
    const mKey = merchantKey(e.merchant);
    if (!mKey) continue;
    const bucket = buckets.get(mKey) ?? {
      display: sanitizeMerchant(e.merchant),
      samples: [],
    };
    bucket.samples.push({
      entry: e,
      chargeMs,
      day: new Date(e.chargeDate).getDate(),
    });
    buckets.set(mKey, bucket);
  }

  const out: SubscriptionCandidate[] = [];
  for (const [mKey, bucket] of buckets) {
    if (bucket.samples.length < MIN_OCCURRENCES) continue;
    // Skip if any active rule already covers this merchant.
    if (args.rules.some((r) => ruleCoversMerchant(r, mKey))) continue;

    bucket.samples.sort((a, b) => a.chargeMs - b.chargeMs);

    // Inter-charge gaps (days).
    const gaps: number[] = [];
    for (let i = 1; i < bucket.samples.length; i++) {
      const days =
        (bucket.samples[i].chargeMs - bucket.samples[i - 1].chargeMs) /
        86_400_000;
      gaps.push(days);
    }
    if (gaps.length === 0) continue;
    const meanGap = gaps.reduce((s, v) => s + v, 0) / gaps.length;
    if (meanGap < MONTHLY_GAP_MIN || meanGap > MONTHLY_GAP_MAX) continue;

    // Amount stability — coefficient of variation must be tight.
    const amounts = bucket.samples.map((s) => s.entry.amount);
    const meanAmount = amounts.reduce((s, v) => s + v, 0) / amounts.length;
    if (meanAmount <= 0) continue;
    const cv = stddev(amounts) / meanAmount;
    if (cv > AMOUNT_DRIFT_MAX) continue;

    const suggestedAmount = Math.round(median(amounts) * 100) / 100;
    const suggestedDay =
      mode(bucket.samples.map((s) => s.day)) ?? bucket.samples[0].day;
    const suggestedCategory =
      (mode(bucket.samples.map((s) => s.entry.category)) as CategoryId) ??
      ("other" as CategoryId);

    const confidence: SubscriptionCandidate["confidence"] =
      bucket.samples.length >= 4 && cv < 0.1
        ? "high"
        : bucket.samples.length >= 4 || cv < 0.15
          ? "medium"
          : "low";

    out.push({
      merchantKey: mKey,
      displayName: bucket.display,
      suggestedAmount,
      suggestedDay,
      suggestedCategory,
      occurrenceCount: bucket.samples.length,
      meanGapDays: Math.round(meanGap * 10) / 10,
      confidence,
      sampleEntryIds: bucket.samples
        .slice()
        .reverse()
        .map((s) => s.entry.id),
    });
  }

  // Highest confidence + most occurrences first.
  const confidenceWeight = { high: 3, medium: 2, low: 1 } as const;
  out.sort((a, b) => {
    const cw = confidenceWeight[b.confidence] - confidenceWeight[a.confidence];
    if (cw !== 0) return cw;
    return b.occurrenceCount - a.occurrenceCount;
  });

  return out;
}
