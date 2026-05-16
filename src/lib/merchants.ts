// Per-merchant aggregation.
//
// Most analytics in the app slice by category. Spend is often dominated by a
// handful of merchants inside a category (one Shufersal trip swallows the
// whole "food" line), so this helper surfaces the actual offenders.

import type { ExpenseEntry, MonthKey } from "@/types/finance";
import type { CategoryId } from "@/lib/categories";
import { sliceForMonth } from "@/lib/projections";
import { merchantKey } from "@/lib/sanitize";

export type MerchantRow = {
  /** Display name — first variant of the merchant we saw. */
  merchant: string;
  /** Normalised merchant key, used as React key + de-dup hash. */
  key: string;
  category: CategoryId;
  /** Σ slice amounts this month. */
  total: number;
  /** Number of charges this month (slices). */
  count: number;
};

export function topMerchants(args: {
  entries: ExpenseEntry[];
  monthKey: MonthKey;
  /** Cap on rows returned. Defaults to 5. */
  limit?: number;
}): MerchantRow[] {
  const limit = Math.max(1, Math.min(50, args.limit ?? 5));

  type Bucket = {
    merchant: string;
    category: CategoryId;
    total: number;
    count: number;
  };
  const buckets = new Map<string, Bucket>();

  for (const entry of args.entries) {
    if (entry.needsConfirmation) continue;
    if (entry.bankPending) continue;
    if (entry.isRefund) continue;
    if (entry.currency && entry.currency !== "ILS") continue;
    const m = entry.merchant?.trim();
    if (!m) continue;
    const key = merchantKey(m);
    if (!key) continue;
    const slice = sliceForMonth(entry, args.monthKey);
    if (!slice) continue;
    const existing = buckets.get(key) ?? {
      merchant: m,
      category: entry.category,
      total: 0,
      count: 0,
    };
    existing.total += slice.amount;
    existing.count += 1;
    buckets.set(key, existing);
  }

  const rows: MerchantRow[] = Array.from(buckets.entries()).map(
    ([key, b]) => ({
      key,
      merchant: b.merchant,
      category: b.category,
      total: b.total,
      count: b.count,
    }),
  );
  rows.sort((a, b) => b.total - a.total);
  return rows.slice(0, limit);
}
