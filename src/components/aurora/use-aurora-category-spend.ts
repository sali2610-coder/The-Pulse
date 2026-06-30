"use client";

// Phase 439 · AURORA recovery — Category Spend hook
//
// Reconstructs the "לאן הולך הכסף" surface from legacy. Reads only
// existing engine helpers — categoryTotals (projections),
// categoryTrends (forecast), sliceForMonth + ruleSchedule — and
// composes per-category rows with delta vs prior 3-month average,
// ending-installments badge count, and share-of-total.
//
// UI-only. No formulas changed.

import { useMemo } from "react";

import { addMonths, currentMonthKey } from "@/lib/dates";
import type { MonthKey } from "@/types/finance";
import { getCategory, type CategoryId } from "@/lib/categories";
import { categoryTrends } from "@/lib/forecast";
import { ruleSchedule } from "@/lib/installment-schedule";
import {
  categoryTotals,
  sliceForMonth,
} from "@/lib/projections";
import { useFinanceStore } from "@/lib/store";

export type AuroraCategoryPreset = {
  key: "this" | "prev" | "prev2";
  label: string;
  monthKey: MonthKey;
};

export type AuroraCategoryRow = {
  category: CategoryId;
  label: string;
  accent: string;
  amount: number;
  share: number;
  deltaPct: number | null;
  endingCount: number;
  fixedAmount: number;
  oneOffAmount: number;
  itemCount: number;
};

export type AuroraCategoryReport = {
  monthKey: MonthKey;
  monthLabel: string;
  total: number;
  rows: AuroraCategoryRow[];
};

const HEBREW_MONTH = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

function labelMonth(monthKey: MonthKey): string {
  const [y, m] = monthKey.split("-").map(Number);
  return `${HEBREW_MONTH[(m ?? 1) - 1]} ${y}`;
}

function safeCategory(id: string): { label: string; accent: string } {
  try {
    const c = getCategory(id as CategoryId);
    return { label: c.label, accent: c.accent };
  } catch {
    return { label: "אחר", accent: "#94A3B8" };
  }
}

export function useAuroraCategorySpend(
  monthKey: MonthKey,
): AuroraCategoryReport {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);

  return useMemo<AuroraCategoryReport>(() => {
    const monthLabel = labelMonth(monthKey);
    if (!hydrated) {
      return { monthKey, monthLabel, total: 0, rows: [] };
    }
    // engine map: categoryId → actual-spent so far this month
    const totalsMap = categoryTotals({ entries, monthKey });
    const trends = categoryTrends({ entries, monthKey, lookback: 3 });
    const trendByCat = new Map<string, number>();
    for (const t of trends) {
      if (t.deltaPct !== null) trendByCat.set(t.category, t.deltaPct);
    }

    // Ending-installments count next month — single shared map.
    const nextKey = addMonths(monthKey, 1);
    const endingByCat = new Map<string, number>();
    for (const rule of rules) {
      if (!rule.active) continue;
      if (!rule.installmentTotal || rule.installmentTotal <= 1) continue;
      const here = ruleSchedule(rule, monthKey);
      const there = ruleSchedule(rule, nextKey);
      if (here.active && !there.active) {
        endingByCat.set(rule.category, (endingByCat.get(rule.category) ?? 0) + 1);
      }
    }
    for (const e of entries) {
      if (e.installments <= 1) continue;
      const here = sliceForMonth(e, monthKey);
      const there = sliceForMonth(e, nextKey);
      if (here && !there) {
        endingByCat.set(e.category, (endingByCat.get(e.category) ?? 0) + 1);
      }
    }

    // Split fixed (active rule) vs one-off (entry slice) per category.
    const fixedByCat = new Map<string, number>();
    const oneOffByCat = new Map<string, number>();
    const itemCountByCat = new Map<string, number>();
    for (const e of entries) {
      const slice = sliceForMonth(e, monthKey);
      if (!slice) continue;
      oneOffByCat.set(
        e.category,
        (oneOffByCat.get(e.category) ?? 0) + slice.amount,
      );
      itemCountByCat.set(
        e.category,
        (itemCountByCat.get(e.category) ?? 0) + 1,
      );
    }
    for (const rule of rules) {
      const sched = ruleSchedule(rule, monthKey);
      if (!rule.active || !sched.active) continue;
      fixedByCat.set(
        rule.category,
        (fixedByCat.get(rule.category) ?? 0) + rule.estimatedAmount,
      );
      itemCountByCat.set(
        rule.category,
        (itemCountByCat.get(rule.category) ?? 0) + 1,
      );
    }

    const cats = new Set<string>([
      ...totalsMap.keys(),
      ...fixedByCat.keys(),
      ...oneOffByCat.keys(),
    ]);
    let grandTotal = 0;
    for (const v of totalsMap.values()) grandTotal += v;
    grandTotal = Math.max(1, grandTotal);

    const rows: AuroraCategoryRow[] = Array.from(cats)
      .map((catId) => {
        const meta = safeCategory(catId);
        const fixed = fixedByCat.get(catId) ?? 0;
        const oneOff = oneOffByCat.get(catId) ?? 0;
        const amount = totalsMap.get(catId as CategoryId) ?? 0;
        return {
          category: catId as CategoryId,
          label: meta.label,
          accent: meta.accent,
          amount: Math.round(amount),
          share: amount / grandTotal,
          deltaPct: trendByCat.get(catId) ?? null,
          endingCount: endingByCat.get(catId) ?? 0,
          fixedAmount: Math.round(fixed),
          oneOffAmount: Math.round(oneOff),
          itemCount: itemCountByCat.get(catId) ?? 0,
        };
      })
      .filter((r) => r.amount > 0 || r.fixedAmount > 0)
      .sort((a, b) => b.amount - a.amount);

    return {
      monthKey,
      monthLabel,
      total: Math.round(
        Array.from(totalsMap.values()).reduce((s, v) => s + v, 0),
      ),
      rows,
    };
  }, [hydrated, entries, rules, statuses, monthKey]);
}

export function defaultCategoryPresets(): AuroraCategoryPreset[] {
  const now = currentMonthKey();
  return [
    { key: "this", label: "החודש", monthKey: now },
    { key: "prev", label: "חודש שעבר", monthKey: addMonths(now, -1) },
    { key: "prev2", label: "לפני 2 חודשים", monthKey: addMonths(now, -2) },
  ];
}
