// Foreign-currency spend summary.
//
// Entries marked with a non-ILS currency are excluded from every
// budget calculation in the financial brain (no FX rate is tracked).
// They still represent real spend, though, so this helper surfaces
// them as a compact per-currency view so the user knows how much
// foreign-currency activity happened in a month.
//
// Pure compute — no mutation, no persistence.

import type { Currency, ExpenseEntry, MonthKey } from "@/types/finance";
import { sliceForMonth } from "@/lib/projections";

export type FxBucket = {
  currency: Currency;
  total: number;
  count: number;
};

export type FxSummary = {
  buckets: FxBucket[];
  totalEntries: number;
};

export function summarizeForeignCurrency(args: {
  entries: ExpenseEntry[];
  monthKey: MonthKey;
}): FxSummary {
  const totals = new Map<Currency, { total: number; count: number }>();
  for (const entry of args.entries) {
    if (!entry.currency || entry.currency === "ILS") continue;
    if (entry.isRefund) continue;
    if (entry.needsConfirmation) continue;
    if (entry.bankPending) continue;
    const slice = sliceForMonth(entry, args.monthKey);
    if (!slice) continue;
    const bucket = totals.get(entry.currency) ?? { total: 0, count: 0 };
    bucket.total += slice.amount;
    bucket.count += 1;
    totals.set(entry.currency, bucket);
  }
  const buckets: FxBucket[] = Array.from(totals.entries()).map(
    ([currency, b]) => ({
      currency,
      total: b.total,
      count: b.count,
    }),
  );
  buckets.sort((a, b) => b.total - a.total);
  return {
    buckets,
    totalEntries: buckets.reduce((s, b) => s + b.count, 0),
  };
}
