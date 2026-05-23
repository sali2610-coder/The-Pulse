// Per-merchant frequency intelligence.
//
// Aggregates the entry log by canonicalised merchant key (so
// "שופרסל סניף 12" and "שופרסל" collapse to one row). For each
// merchant returns:
//
//   - visits          — distinct charge events this month
//   - monthlyTotal    — sum of slice amounts that hit this month
//   - averageTicket   — monthlyTotal / visits
//   - priorTotal      — same merchant's total in the prior month
//   - deltaPct        — (this − prior) / prior, signed. Infinity when
//                       prior is 0 and current > 0 ("new merchant").
//
// Useful for smarter categorization later (auto-suggest the category
// of the dominant merchant), for "you visit X store often" insights,
// and for trend nudges.
//
// Pure compute. Reuses sliceForMonth + merchantKey + sanitizeMerchant.

import type { ExpenseEntry, MonthKey } from "@/types/finance";
import { addMonths, monthKeyOf } from "@/lib/dates";
import { sliceForMonth } from "@/lib/projections";
import { merchantKey, sanitizeMerchant } from "@/lib/sanitize";

export type MerchantFrequencyRow = {
  key: string;
  /** Best-effort human label (first sanitized name observed). */
  label: string;
  visits: number;
  monthlyTotal: number;
  averageTicket: number;
  priorTotal: number;
  /** Signed proportional change vs prior month. Infinity = brand new. */
  deltaPct: number;
};

export function merchantFrequency(args: {
  entries: ExpenseEntry[];
  monthKey?: MonthKey;
  now?: Date;
}): MerchantFrequencyRow[] {
  const now = args.now ?? new Date();
  const monthKey: MonthKey = args.monthKey ?? monthKeyOf(now);
  const priorKey = addMonths(monthKey, -1);

  const current = aggregate(args.entries, monthKey);
  const prior = aggregate(args.entries, priorKey);

  const rows: MerchantFrequencyRow[] = [];
  for (const [key, c] of current) {
    const p = prior.get(key);
    const priorTotal = p?.monthlyTotal ?? 0;
    const deltaPct =
      priorTotal === 0
        ? c.monthlyTotal > 0
          ? Number.POSITIVE_INFINITY
          : 0
        : (c.monthlyTotal - priorTotal) / priorTotal;
    rows.push({
      key,
      label: c.label,
      visits: c.visits,
      monthlyTotal: Math.round(c.monthlyTotal * 100) / 100,
      averageTicket:
        c.visits > 0
          ? Math.round((c.monthlyTotal / c.visits) * 100) / 100
          : 0,
      priorTotal: Math.round(priorTotal * 100) / 100,
      deltaPct,
    });
  }
  rows.sort((a, b) => b.monthlyTotal - a.monthlyTotal);
  return rows;
}

function aggregate(
  entries: ExpenseEntry[],
  monthKey: MonthKey,
): Map<string, { label: string; visits: number; monthlyTotal: number }> {
  const out = new Map<
    string,
    { label: string; visits: number; monthlyTotal: number }
  >();
  for (const e of entries) {
    if (e.isRefund) continue;
    if (e.needsConfirmation) continue;
    if (e.bankPending) continue;
    if (e.excludeFromBudget) continue;
    if (e.currency && e.currency !== "ILS") continue;
    const slice = sliceForMonth(e, monthKey);
    if (!slice) continue;
    const raw = e.merchant ?? e.note ?? "";
    const key = merchantKey(raw);
    if (!key) continue;
    const label = sanitizeMerchant(raw) || raw.trim();
    const cur = out.get(key);
    if (cur) {
      cur.visits += 1;
      cur.monthlyTotal += slice.amount;
    } else {
      out.set(key, { label, visits: 1, monthlyTotal: slice.amount });
    }
  }
  return out;
}
