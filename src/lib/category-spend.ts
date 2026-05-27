// Phase 243 — per-category spend intelligence for the current month.
//
// Splits each category into recurring (committed monthly outflows)
// vs discretionary (one-shot + installment entries) so the user
// can see at a glance where the money is going AND how much of it
// is committed vs variable.
//
// Pure compute. Reuses `sliceForMonth` (already the canonical way
// to attribute installment plans to the right month) and the
// rule.estimatedAmount fixed-cost stream.

import type {
  CategoryId,
} from "@/lib/categories";
import type {
  ExpenseEntry,
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import { sliceForMonth, isSkippedStatus, buildStatusMap } from "@/lib/projections";

export type CategorySpendBreakdown = {
  category: CategoryId;
  total: number;
  recurring: number;
  discretionary: number;
  /** Entries that fall in this month for this category — already
   *  installment-aware via sliceForMonth. */
  items: Array<{
    id: string;
    label: string;
    amount: number;
    chargeDate: string;
    source: "entry" | "rule";
    isRecurring: boolean;
  }>;
};

export type CategorySpendReport = {
  monthKey: MonthKey;
  total: number;
  byCategory: CategorySpendBreakdown[];
};

export function buildCategorySpend(args: {
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  monthKey: MonthKey;
}): CategorySpendReport {
  const out = new Map<CategoryId, CategorySpendBreakdown>();
  const statusMap = buildStatusMap(args.statuses);

  function ensure(cat: CategoryId): CategorySpendBreakdown {
    const found = out.get(cat);
    if (found) return found;
    const fresh: CategorySpendBreakdown = {
      category: cat,
      total: 0,
      recurring: 0,
      discretionary: 0,
      items: [],
    };
    out.set(cat, fresh);
    return fresh;
  }

  // 1. Entries — discretionary by default. installments == 1 → one-shot.
  for (const e of args.entries) {
    if (e.isRefund) continue;
    const slice = sliceForMonth(e, args.monthKey);
    if (!slice) continue;
    const grp = ensure(e.category);
    grp.total += slice.amount;
    grp.discretionary += slice.amount;
    grp.items.push({
      id: e.id,
      label: e.merchant ?? e.note ?? "הוצאה",
      amount: slice.amount,
      chargeDate: slice.chargeDate.toISOString(),
      source: "entry",
      isRecurring: false,
    });
  }

  // 2. Recurring rules — fixed cost for the month if not skipped/paid.
  //    Already-paid rules don't add: their `matchedExpenseId` entry was
  //    counted above.
  for (const r of args.rules) {
    if (!r.active) continue;
    const status = statusMap.get(`${r.id}__${args.monthKey}`);
    if (status?.status === "paid") continue;
    if (isSkippedStatus(status)) continue;
    const grp = ensure(r.category);
    grp.total += r.estimatedAmount;
    grp.recurring += r.estimatedAmount;
    grp.items.push({
      id: r.id,
      label: r.label,
      amount: r.estimatedAmount,
      chargeDate: dateForDayOfMonth(args.monthKey, r.dayOfMonth).toISOString(),
      source: "rule",
      isRecurring: true,
    });
  }

  const ordered = [...out.values()]
    .map((g) => ({
      ...g,
      total: round2(g.total),
      recurring: round2(g.recurring),
      discretionary: round2(g.discretionary),
      items: g.items.slice().sort(
        (a, b) =>
          new Date(a.chargeDate).getTime() - new Date(b.chargeDate).getTime(),
      ),
    }))
    .sort((a, b) => b.total - a.total);

  const total = ordered.reduce((acc, g) => acc + g.total, 0);

  return {
    monthKey: args.monthKey,
    total: round2(total),
    byCategory: ordered,
  };
}

function dateForDayOfMonth(monthKey: MonthKey, day: number): Date {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, Math.min(28, Math.max(1, day)));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
