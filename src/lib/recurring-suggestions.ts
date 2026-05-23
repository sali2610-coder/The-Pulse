// Recurring-rule auto-suggestions.
//
// Scans the entry log for merchant patterns that LOOK like a
// recurring subscription/bill but haven't been promoted to a
// RecurringRule yet: same merchantKey, similar amount (±15%),
// at least N (default 3) consecutive months with at least one
// charge. Returns a suggestion list the user can convert to
// real rules with a single tap.
//
// Pure compute. Does NOT mutate the store — emission stays
// suggestion-only until the user confirms.

import type { ExpenseEntry, RecurringRule } from "@/types/finance";
import type { CategoryId } from "@/lib/categories";
import { addMonths, monthKeyOf } from "@/lib/dates";
import { merchantKey, sanitizeMerchant } from "@/lib/sanitize";

export type RecurringSuggestion = {
  /** Stable id for React keys / dismissal. */
  id: string;
  merchantKey: string;
  label: string;
  category: CategoryId;
  estimatedAmount: number; // median of detected charges
  dayOfMonth: number; // median of detected days
  /** Months we saw at least one charge from this merchant. */
  observedMonths: number;
  /** First seen ISO. */
  firstSeen: string;
  /** Last seen ISO. */
  lastSeen: string;
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function within(value: number, target: number, pct: number): boolean {
  if (target === 0) return value === 0;
  return Math.abs(value - target) / target <= pct;
}

export type SuggestionArgs = {
  entries: ExpenseEntry[];
  /** Existing rules — used to skip merchants the user already
   *  promoted. */
  rules: RecurringRule[];
  /** Required number of distinct consecutive months. Default 3. */
  minMonths?: number;
  /** Anchor `end` for the lookback window. Default `now`. */
  end?: Date;
  /** Lookback in months. Default 6. */
  lookbackMonths?: number;
  /** Allowed amount-variation per detected merchant. Default 0.15. */
  variance?: number;
};

export function detectRecurringSuggestions(
  args: SuggestionArgs,
): RecurringSuggestion[] {
  const end = args.end ?? new Date();
  const endKey = monthKeyOf(end);
  const lookback = Math.max(2, args.lookbackMonths ?? 6);
  const minMonths = Math.max(2, args.minMonths ?? 3);
  const variance = args.variance ?? 0.15;

  // Set of merchantKeys already promoted to rules (via the rule's
  // label or via a dedicated `linkedCardId`-style merchant slot we
  // don't have today — keyword-match the label).
  const promoted = new Set<string>();
  for (const r of args.rules) {
    const k = merchantKey(r.label);
    if (k) promoted.add(k);
    for (const kw of r.keywords) {
      const kk = merchantKey(kw);
      if (kk) promoted.add(kk);
    }
  }

  // Bucket entries by merchantKey across the lookback window.
  type Bucket = {
    key: string;
    labelCounts: Map<string, number>;
    category: Map<CategoryId, number>;
    amounts: number[];
    days: number[];
    months: Set<string>;
    firstMs: number;
    lastMs: number;
  };
  const buckets = new Map<string, Bucket>();
  const startKey = (() => {
    let k = endKey;
    for (let i = 0; i < lookback - 1; i++) k = addMonths(k, -1);
    return k;
  })();
  const startMs = (() => {
    const [y, m] = startKey.split("-").map(Number);
    return new Date(y, m - 1, 1).getTime();
  })();
  const endMs = end.getTime();

  for (const e of args.entries) {
    if (e.isRefund) continue;
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
    if (promoted.has(key)) continue;
    const b = buckets.get(key) ?? ({
      key,
      labelCounts: new Map<string, number>(),
      category: new Map<CategoryId, number>(),
      amounts: [],
      days: [],
      months: new Set<string>(),
      firstMs: t,
      lastMs: t,
    } as Bucket);
    const label = sanitizeMerchant(e.merchant);
    b.labelCounts.set(label, (b.labelCounts.get(label) ?? 0) + 1);
    b.category.set(e.category, (b.category.get(e.category) ?? 0) + 1);
    b.amounts.push(e.amount);
    b.days.push(new Date(t).getDate());
    b.months.add(monthKeyOf(new Date(t)));
    if (t < b.firstMs) b.firstMs = t;
    if (t > b.lastMs) b.lastMs = t;
    buckets.set(key, b);
  }

  const out: RecurringSuggestion[] = [];
  for (const b of buckets.values()) {
    if (b.months.size < minMonths) continue;
    const med = median(b.amounts);
    // Filter when amounts vary too widely — heuristic against
    // restaurants the user happens to visit often.
    const within15 = b.amounts.every((v) => within(v, med, variance));
    if (!within15) continue;
    // Pick most-frequent display label + category.
    let bestLabel = "";
    let bestLabelCount = -1;
    for (const [name, count] of b.labelCounts) {
      if (count > bestLabelCount) {
        bestLabelCount = count;
        bestLabel = name;
      }
    }
    let bestCat: CategoryId = "other";
    let bestCatCount = -1;
    for (const [cat, count] of b.category) {
      if (count > bestCatCount) {
        bestCatCount = count;
        bestCat = cat;
      }
    }
    out.push({
      id: `suggestion:${b.key}`,
      merchantKey: b.key,
      label: bestLabel,
      category: bestCat,
      estimatedAmount: med,
      dayOfMonth: Math.max(1, Math.min(31, Math.round(median(b.days)))),
      observedMonths: b.months.size,
      firstSeen: new Date(b.firstMs).toISOString(),
      lastSeen: new Date(b.lastMs).toISOString(),
    });
  }
  // Highest observedMonths first; tie-break by estimatedAmount DESC.
  out.sort((a, b) => {
    if (b.observedMonths !== a.observedMonths)
      return b.observedMonths - a.observedMonths;
    return b.estimatedAmount - a.estimatedAmount;
  });
  return out;
}
