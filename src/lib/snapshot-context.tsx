"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import {
  buildFinancialSnapshot,
  type FinancialSnapshot,
} from "@/lib/financial-snapshot";

/**
 * Single-snapshot context.
 *
 * Phase 84 — performance: every hero card used to call
 * buildFinancialSnapshot(...) inside its own useMemo. Cheap individually
 * but the inputs (accounts/loans/incomes/entries/rules/statuses/budget)
 * are identical, so we were running the same calculation 6-8 times per
 * render of the dashboard tab.
 *
 * Now the dashboard wraps once. Cards use `useSnapshot()`; when the
 * provider re-renders (because any store slice changed) it produces a
 * single fresh snapshot, all consumers receive the same reference, and
 * memoized children of those cards stay stable when the snapshot's
 * shape didn't change.
 *
 * `useSnapshot()` falls back to a locally-computed snapshot if a
 * component is rendered outside the provider — keeps every existing
 * card test/Storybook story / drill-down sheet working unchanged.
 */
const SnapshotContext = createContext<FinancialSnapshot | null>(null);

export function SnapshotProvider({ children }: { children: ReactNode }) {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  const snapshot = useMemo<FinancialSnapshot | null>(() => {
    if (!hydrated) return null;
    return buildFinancialSnapshot({
      accounts,
      loans,
      incomes,
      entries,
      rules,
      statuses,
      monthlyBudget,
      monthKey: currentMonthKey(),
    });
  }, [
    hydrated,
    accounts,
    loans,
    incomes,
    entries,
    rules,
    statuses,
    monthlyBudget,
  ]);

  return (
    <SnapshotContext.Provider value={snapshot}>
      {children}
    </SnapshotContext.Provider>
  );
}

/** Read the dashboard's shared snapshot. Returns null until hydrated. */
export function useSnapshot(): FinancialSnapshot | null {
  return useContext(SnapshotContext);
}
