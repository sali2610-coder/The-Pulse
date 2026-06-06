// Phase 265 — flatten the per-card hierarchy into Card-Month
// "folders". Each (card × month) becomes its own top-level surface
// so the brain reads "Hitechzon — June" + "Hitechzon — July" as
// two distinct envelopes instead of one giant card with internal
// dividers.
//
// View-layer only. The engine output (CardBreakdownReport) is
// unchanged; this helper just rebuckets items by month and
// rebuilds category groups per (card, month).

import type { CategoryId } from "@/lib/categories";
import type {
  CardBreakdown,
  CardBreakdownReport,
  CategoryGroup,
  ChargeKind,
} from "@/lib/card-category-breakdown";
import {
  hebrewMonthFromKey,
  type MonthGroupLabelKind,
} from "@/lib/card-month-grouping";

export type CardMonthFolder = {
  /** Stable key for React + tests. */
  id: string;
  cardId: string;
  cardLabel: string;
  cardLast4?: string;
  monthKey: string;
  monthName: string;
  /** current / next / future relative to `now`. */
  kind: MonthGroupLabelKind;
  /** "Hitechzon — יוני" / "Hitechzon — יולי". */
  folderLabel: string;
  /** Sum of every obligation falling in this (card, month) cell. */
  subtotal: number;
  recurringTotal: number;
  installmentsTotal: number;
  oneTimeTotal: number;
  /** Category groups scoped to this month (filtered items). */
  categories: CategoryGroup[];
};

function currentMonthKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function nextMonthKey(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function tierOf(monthKey: string, now: Date): MonthGroupLabelKind {
  if (monthKey === currentMonthKey(now)) return "current";
  if (monthKey === nextMonthKey(now)) return "next";
  return "future";
}

function monthOfISO(iso: string): string {
  return iso.slice(0, 7);
}

export function buildCardMonthFolders(
  report: CardBreakdownReport,
  now: Date = new Date(),
): CardMonthFolder[] {
  const out: CardMonthFolder[] = [];

  for (const card of report.cards) {
    // First pass — collect all items across categories AND record
    // which (category, month) each item belongs to so we can
    // reconstitute per-month CategoryGroup buckets without losing
    // the original kind splits.
    const monthSet = new Set<string>();
    for (const cat of card.categories) {
      for (const it of cat.items) {
        monthSet.add(monthOfISO(it.effectiveCashAt));
      }
    }
    if (monthSet.size === 0) continue;

    const monthsSorted = [...monthSet].sort();
    for (const monthKey of monthsSorted) {
      const folder = buildFolderFor(card, monthKey, now);
      if (folder.subtotal === 0 && folder.categories.length === 0) continue;
      out.push(folder);
    }
  }

  // Sort folders: by card subtotal desc (so the user reads the
  // heavy cards first), and within each card chronologically.
  out.sort((a, b) => {
    if (a.cardId !== b.cardId) {
      // Card precedence by original report ordering — already
      // sorted by total desc, so keep that.
      const aIdx = report.cards.findIndex((c) => c.cardId === a.cardId);
      const bIdx = report.cards.findIndex((c) => c.cardId === b.cardId);
      return aIdx - bIdx;
    }
    return a.monthKey.localeCompare(b.monthKey);
  });

  return out;
}

function buildFolderFor(
  card: CardBreakdown,
  monthKey: string,
  now: Date,
): CardMonthFolder {
  const kind = tierOf(monthKey, now);
  const monthName = hebrewMonthFromKey(monthKey);
  const categories: CategoryGroup[] = [];
  let subtotal = 0;
  let recurringTotal = 0;
  let installmentsTotal = 0;
  let oneTimeTotal = 0;

  for (const cat of card.categories) {
    const items = cat.items.filter(
      (it) => monthOfISO(it.effectiveCashAt) === monthKey,
    );
    if (items.length === 0) continue;
    const scoped = scopedGroup(cat.category, items);
    categories.push(scoped);
    subtotal += scoped.total;
    recurringTotal += scoped.recurring;
    installmentsTotal += scoped.installments;
    oneTimeTotal += scoped.oneTime;
  }

  return {
    id: `${card.cardId}:${monthKey}`,
    cardId: card.cardId,
    cardLabel: card.cardLabel,
    cardLast4: card.cardLast4,
    monthKey,
    monthName,
    kind,
    folderLabel: `${card.cardLabel} — ${monthName}`,
    // Phase 396 — engine is now the rounding boundary. Folders pass
    // raw floats; UI rounds at display only.
    subtotal,
    recurringTotal,
    installmentsTotal,
    oneTimeTotal,
    categories,
  };
}

function scopedGroup(
  category: CategoryId,
  items: CategoryGroup["items"],
): CategoryGroup {
  let total = 0;
  let recurring = 0;
  let installments = 0;
  let oneTime = 0;
  for (const it of items) {
    total += it.amount;
    if (it.kind === "recurring") recurring += it.amount;
    else if (it.kind === "installments") installments += it.amount;
    else oneTime += it.amount;
  }
  return {
    category,
    total,
    recurring,
    installments,
    oneTime,
    items,
  };
}

// Re-export so consumers can label kinds without importing two modules.
export type { ChargeKind };
