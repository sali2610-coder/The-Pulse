// Weekly review.
//
// Phase 4.4 — companion to the existing MonthlyDigest. Compares
// this week vs the prior week (rolling 7-day windows, week
// boundary = `now`). Pure compute. Reuses sliceForMonth so an
// installment plan slice that lands inside the window is counted
// against its slice amount, not the parent entry's total.

import type { CategoryId } from "@/lib/categories";
import type { ExpenseEntry } from "@/types/finance";
import { sliceForMonth } from "@/lib/projections";
import { monthKeyOf } from "@/lib/dates";

export type CategoryDelta = {
  category: CategoryId;
  thisWeek: number;
  priorWeek: number;
  delta: number;
  deltaPct: number; // signed; Infinity when priorWeek is 0
};

export type WeeklyReview = {
  /** Window end (exclusive of next second). Defaults to `now`. */
  end: Date;
  /** Window start (inclusive) — 7 days before `end`. */
  start: Date;
  spentThisWeek: number;
  spentPriorWeek: number;
  delta: number; // thisWeek - priorWeek
  deltaPct: number; // signed; Infinity when priorWeek is 0
  /** Categories with the biggest absolute change, sorted by |delta| DESC. */
  topMovers: CategoryDelta[];
  /** Single biggest charge that landed inside the current window. */
  biggestCharge: {
    amount: number;
    merchant: string | undefined;
    category: CategoryId;
    when: Date;
  } | null;
  /** Total number of charges in the current window. */
  chargesThisWeek: number;
};

function sliceFallsIn(
  entry: ExpenseEntry,
  start: Date,
  end: Date,
): { amount: number; when: Date } | null {
  if (entry.isRefund) return null;
  if (entry.needsConfirmation) return null;
  if (entry.bankPending) return null;
  if (entry.excludeFromBudget) return null;
  if (entry.currency && entry.currency !== "ILS") return null;
  // Check the two months the window can touch.
  const monthsToScan = new Set<string>();
  monthsToScan.add(monthKeyOf(start));
  monthsToScan.add(monthKeyOf(end));
  for (const mk of monthsToScan) {
    const slice = sliceForMonth(entry, mk);
    if (!slice) continue;
    const t = slice.chargeDate.getTime();
    if (t >= start.getTime() && t < end.getTime()) {
      return { amount: slice.amount, when: slice.chargeDate };
    }
  }
  return null;
}

export function weeklyReview(args: {
  entries: ExpenseEntry[];
  now?: Date;
}): WeeklyReview {
  const end = args.now ?? new Date();
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
  const start = new Date(end.getTime() - oneWeekMs);
  const priorStart = new Date(start.getTime() - oneWeekMs);

  let spentThisWeek = 0;
  let spentPriorWeek = 0;
  let chargesThisWeek = 0;
  let biggestCharge: WeeklyReview["biggestCharge"] = null;
  const thisWeekByCat = new Map<CategoryId, number>();
  const priorWeekByCat = new Map<CategoryId, number>();

  for (const entry of args.entries) {
    const now = sliceFallsIn(entry, start, end);
    if (now) {
      spentThisWeek += now.amount;
      chargesThisWeek += 1;
      thisWeekByCat.set(
        entry.category,
        (thisWeekByCat.get(entry.category) ?? 0) + now.amount,
      );
      if (!biggestCharge || now.amount > biggestCharge.amount) {
        biggestCharge = {
          amount: now.amount,
          merchant: entry.merchant,
          category: entry.category,
          when: now.when,
        };
      }
    }
    const prior = sliceFallsIn(entry, priorStart, start);
    if (prior) {
      spentPriorWeek += prior.amount;
      priorWeekByCat.set(
        entry.category,
        (priorWeekByCat.get(entry.category) ?? 0) + prior.amount,
      );
    }
  }

  // Build per-category delta list.
  const cats = new Set<CategoryId>([
    ...thisWeekByCat.keys(),
    ...priorWeekByCat.keys(),
  ]);
  const movers: CategoryDelta[] = [];
  for (const cat of cats) {
    const tw = thisWeekByCat.get(cat) ?? 0;
    const pw = priorWeekByCat.get(cat) ?? 0;
    const delta = tw - pw;
    if (delta === 0) continue;
    const deltaPct = pw === 0 ? Number.POSITIVE_INFINITY : (delta / pw) * 100;
    movers.push({ category: cat, thisWeek: tw, priorWeek: pw, delta, deltaPct });
  }
  movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const delta = spentThisWeek - spentPriorWeek;
  const deltaPct =
    spentPriorWeek === 0
      ? Number.POSITIVE_INFINITY
      : (delta / spentPriorWeek) * 100;

  return {
    end,
    start,
    spentThisWeek,
    spentPriorWeek,
    delta,
    deltaPct,
    topMovers: movers.slice(0, 3),
    biggestCharge,
    chargesThisWeek,
  };
}
