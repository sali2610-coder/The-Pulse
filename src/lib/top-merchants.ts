// Top merchants leaderboard.
//
// 12-month per-merchant totals + cadence. Uses merchantKey to
// canonicalise variants (e.g. "שופרסל סניף 12" + "שופרסל" → one
// row) so the leaderboard reflects real concentration, not noise.
//
// Pure compute.

import type { ExpenseEntry } from "@/types/finance";
import { merchantKey, sanitizeMerchant } from "@/lib/sanitize";

export type MerchantStat = {
  /** Canonical display name (taken from the most-frequent variant). */
  label: string;
  /** Normalised merchantKey used to bucket entries. */
  key: string;
  netTotal: number; // outflows minus refunds for this merchant
  outflowTotal: number;
  refundTotal: number;
  chargeCount: number; // outflow rows only
  firstSeen: string; // earliest chargeDate ISO
  lastSeen: string; // latest chargeDate ISO
  /** Number of distinct calendar months containing at least one
   *  charge from this merchant. Lets the UI render "every month"
   *  vs "twice a year" cadence. */
  monthsActive: number;
};

export type TopMerchantsAnnualArgs = {
  entries: ExpenseEntry[];
  /** Anchor `now` (default current time). Window is [now − days, now]. */
  end?: Date;
  /** Window length in days. Default 365. */
  days?: number;
  /** Cap on the returned leaderboard. Default 10. */
  limit?: number;
};

export function topMerchantsAnnual(args: TopMerchantsAnnualArgs): MerchantStat[] {
  const end = args.end ?? new Date();
  const endMs = end.getTime();
  const days = args.days ?? 365;
  const startMs = endMs - days * 86_400_000;

  type Bucket = {
    key: string;
    /** Per-display-name frequency so we pick the most common
     *  variant for the leaderboard label. */
    labelCounts: Map<string, number>;
    outflowTotal: number;
    refundTotal: number;
    chargeCount: number;
    firstMs: number;
    lastMs: number;
    months: Set<string>;
  };
  const buckets = new Map<string, Bucket>();

  for (const e of args.entries) {
    if (e.needsConfirmation) continue;
    if (e.bankPending) continue;
    if (e.excludeFromBudget) continue;
    if (e.currency && e.currency !== "ILS") continue;
    if (!e.merchant) continue;
    const t = new Date(e.chargeDate).getTime();
    if (!Number.isFinite(t)) continue;
    if (t < startMs || t > endMs) continue;
    const key = merchantKey(e.merchant);
    if (!key) continue;
    const label = sanitizeMerchant(e.merchant);
    const b = buckets.get(key) ?? ({
      key,
      labelCounts: new Map<string, number>(),
      outflowTotal: 0,
      refundTotal: 0,
      chargeCount: 0,
      firstMs: t,
      lastMs: t,
      months: new Set<string>(),
    } as Bucket);
    b.labelCounts.set(label, (b.labelCounts.get(label) ?? 0) + 1);
    if (e.isRefund) {
      b.refundTotal += e.amount;
    } else {
      b.outflowTotal += e.amount;
      b.chargeCount += 1;
    }
    if (t < b.firstMs) b.firstMs = t;
    if (t > b.lastMs) b.lastMs = t;
    const monthBucket = `${new Date(t).getFullYear()}-${new Date(t).getMonth()}`;
    b.months.add(monthBucket);
    buckets.set(key, b);
  }

  const stats: MerchantStat[] = [];
  for (const b of buckets.values()) {
    let bestLabel = "";
    let bestCount = -1;
    for (const [name, count] of b.labelCounts) {
      if (count > bestCount) {
        bestCount = count;
        bestLabel = name;
      }
    }
    stats.push({
      key: b.key,
      label: bestLabel,
      netTotal: b.outflowTotal - b.refundTotal,
      outflowTotal: b.outflowTotal,
      refundTotal: b.refundTotal,
      chargeCount: b.chargeCount,
      firstSeen: new Date(b.firstMs).toISOString(),
      lastSeen: new Date(b.lastMs).toISOString(),
      monthsActive: b.months.size,
    });
  }
  stats.sort((a, b) => b.netTotal - a.netTotal);
  const limit = args.limit ?? 10;
  return stats.slice(0, limit);
}
