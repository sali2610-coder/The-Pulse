// 30-day recurring calendar.
//
// Forward-only per-day projection of every committed line that
// hits in the next N days: recurring rules, installment plans,
// loans, incomes. Pure compute. Reuses monthObligations from
// obligations.ts (no parallel rule schedule logic) — we just walk
// the (at most 2) months the window touches and filter by the
// rolling N-day window.
//
// Output is one entry per day INCLUDING empty days, so the UI
// can render a stable strip without gap-filling itself.

import { addMonths, monthKeyOf } from "@/lib/dates";
import {
  monthObligations,
  type ObligationItem,
} from "@/lib/obligations";
import type {
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";

export type CalendarDay = {
  date: Date;
  items: ObligationItem[];
  /** Σ outflow amounts (positive). Income amounts are signed
   *  negative in ObligationItem so we explicitly skip them when
   *  summing outflow. */
  outflow: number;
  /** Σ income amounts as positives (item.amount negated). */
  income: number;
};

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function dayOf(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function recurringCalendar(args: {
  rules: RecurringRule[];
  loans: Loan[];
  incomes: Income[];
  entries: ExpenseEntry[];
  statuses: RecurringStatus[];
  /** Anchor day (defaults to today). Window starts at this day's
   *  midnight (inclusive). */
  now?: Date;
  /** Window length in days. Default 30. */
  days?: number;
}): CalendarDay[] {
  const days = Math.max(1, args.days ?? 30);
  const start = startOfDay(args.now ?? new Date());
  const startMs = start.getTime();
  const endMs = startMs + days * 86_400_000; // exclusive end

  // Touch every month the window crosses (at most 2 normally, 3 in
  // the rare case the window spans a calendar transition).
  const monthKeys = new Set<string>();
  monthKeys.add(monthKeyOf(start));
  monthKeys.add(monthKeyOf(new Date(endMs - 1)));
  // Defensive: if days > 31, also walk an intermediate month.
  if (days > 31) {
    monthKeys.add(addMonths(monthKeyOf(start), 1));
  }

  const all: ObligationItem[] = [];
  for (const mk of monthKeys) {
    const items = monthObligations({
      rules: args.rules,
      loans: args.loans,
      incomes: args.incomes,
      entries: args.entries,
      statuses: args.statuses,
      monthKey: mk,
    });
    for (const it of items) {
      const t = it.date.getTime();
      if (t < startMs || t >= endMs) continue;
      all.push(it);
    }
  }

  // Bucket by calendar day.
  const buckets = new Map<string, ObligationItem[]>();
  for (const it of all) {
    const k = dayOf(it.date);
    const arr = buckets.get(k) ?? [];
    arr.push(it);
    buckets.set(k, arr);
  }

  // Build the fully-populated N-day strip.
  const out: CalendarDay[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(startMs + i * 86_400_000);
    d.setHours(12, 0, 0, 0); // noon to dodge DST edge cases
    const k = dayOf(d);
    const items = (buckets.get(k) ?? []).slice().sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
    let outflow = 0;
    let income = 0;
    for (const it of items) {
      if (it.kind === "income") income += -it.amount;
      else outflow += it.amount;
    }
    out.push({ date: d, items, outflow, income });
  }
  return out;
}
