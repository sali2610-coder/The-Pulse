// Anomaly detection.
//
// For each merchant the user transacts with, build a baseline from prior
// charges and flag this-month charges that deviate significantly. Surfaces
// the PRD's "intelligent summaries / unusual activity" requirement.
//
// We deliberately keep the heuristic simple — no z-scores, no IQR — because
// most users only have a handful of charges per merchant. The baseline is
// the median of prior-month slices, and we flag charges whose amount is
// both ≥ FACTOR× the baseline AND ≥ MIN_DELTA above it. The double gate
// stops noise on small charges (₪12 vs ₪18 isn't worth a notification).

import type { ExpenseEntry } from "@/types/finance";
import type { CategoryId } from "@/lib/categories";
import { merchantKey } from "@/lib/sanitize";
import { monthIndex, monthKeyOf } from "@/lib/dates";
import { sliceForMonth } from "@/lib/projections";
import type { MonthKey } from "@/types/finance";

const FACTOR_THRESHOLD = 1.5;
const MIN_DELTA = 20; // ₪
const MIN_BASELINE_OBSERVATIONS = 2;
const LOOKBACK_MONTHS = 6;

export type Anomaly = {
  /** Stable identifier for the offending entry. */
  entryId: string;
  merchant: string;
  category: CategoryId;
  /** This month's amount (slice if installment). */
  amount: number;
  /** Median of prior charges from the same merchant. */
  baseline: number;
  /** amount / baseline (how much bigger than usual). */
  factor: number;
  /** amount − baseline (how many shekels above the usual). */
  delta: number;
  chargeDate: string;
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function sliceAmountFor(entry: ExpenseEntry, monthKey: MonthKey): number | null {
  const slice = sliceForMonth(entry, monthKey);
  return slice?.amount ?? null;
}

/**
 * Detect anomalies in `monthKey`. Returns one entry per offending charge,
 * sorted by factor desc (biggest deviation first).
 */
export function detectAnomalies(args: {
  entries: ExpenseEntry[];
  monthKey: MonthKey;
}): Anomaly[] {
  const targetIdx = monthIndex(args.monthKey);
  const earliestIdx = targetIdx - LOOKBACK_MONTHS;

  // Per-merchant baseline buckets (prior months only).
  const baselineByMerchant = new Map<string, number[]>();
  // This-month candidate charges per merchant.
  type Candidate = { entry: ExpenseEntry; amount: number };
  const candidatesByMerchant = new Map<string, Candidate[]>();

  for (const entry of args.entries) {
    if (entry.isRefund) continue;
    if (entry.needsConfirmation) continue;
    if (entry.bankPending) continue;
    if (entry.currency && entry.currency !== "ILS") continue;
    const m = entry.merchant?.trim();
    if (!m) continue;
    const key = merchantKey(m);
    if (!key) continue;

    const entryStartIdx = monthIndex(monthKeyOf(new Date(entry.chargeDate)));
    if (entryStartIdx > targetIdx) continue; // future-month entry
    if (entryStartIdx < earliestIdx) continue; // outside lookback

    // For each month the entry has a slice in, classify as baseline or candidate.
    for (let offset = 0; offset < entry.installments; offset++) {
      const sliceMonthIdx = entryStartIdx + offset;
      if (sliceMonthIdx < earliestIdx) continue;
      if (sliceMonthIdx > targetIdx) break;
      const yr = Math.floor(sliceMonthIdx / 12);
      const mo = (sliceMonthIdx % 12) + 1;
      const sliceMonthKey: MonthKey = `${yr}-${String(mo).padStart(2, "0")}`;
      const amt = sliceAmountFor(entry, sliceMonthKey);
      if (amt === null) continue;

      if (sliceMonthKey === args.monthKey) {
        const list = candidatesByMerchant.get(key) ?? [];
        list.push({ entry, amount: amt });
        candidatesByMerchant.set(key, list);
      } else {
        const list = baselineByMerchant.get(key) ?? [];
        list.push(amt);
        baselineByMerchant.set(key, list);
      }
    }
  }

  const out: Anomaly[] = [];
  for (const [key, candidates] of candidatesByMerchant) {
    const baselineValues = baselineByMerchant.get(key) ?? [];
    if (baselineValues.length < MIN_BASELINE_OBSERVATIONS) continue;
    const baseline = median(baselineValues);
    if (baseline <= 0) continue;
    for (const c of candidates) {
      const delta = c.amount - baseline;
      if (delta < MIN_DELTA) continue;
      const factor = c.amount / baseline;
      if (factor < FACTOR_THRESHOLD) continue;
      out.push({
        entryId: c.entry.id,
        merchant: c.entry.merchant?.trim() || key,
        category: c.entry.category,
        amount: c.amount,
        baseline: Math.round(baseline * 100) / 100,
        factor: Math.round(factor * 100) / 100,
        delta: Math.round(delta * 100) / 100,
        chargeDate: c.entry.chargeDate,
      });
    }
  }
  out.sort((a, b) => b.factor - a.factor);
  return out;
}
