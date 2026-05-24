"use client";

// Phase 211 — bridges budgetMode → PulseBar marker.
//
// Manual users see exactly what they typed. Auto users see the
// liquidity-engine recommendation, so the marker on the PulseBar
// agrees with the "כמה נשאר לי לבזבז" headline. Falls back to the
// user's typed value when the engine returns 0 (e.g. no anchors).

import { useMemo } from "react";

import { useFinanceStore } from "@/lib/store";
import { autoBudget } from "@/lib/auto-budget";
import { effectiveMonthlyBudget } from "@/lib/auto-budget";

export function usePulseBudget(args: {
  monthlyBudget: number;
  budgetMode: "manual" | "auto";
}): number {
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const buffer = useFinanceStore((s) => s.budgetSafetyBuffer);

  return useMemo(() => {
    if (args.budgetMode === "manual") return args.monthlyBudget;
    const autoReport = autoBudget({
      accounts,
      loans,
      incomes,
      entries,
      rules,
      statuses,
      safetyBuffer: buffer,
    });
    return effectiveMonthlyBudget({
      monthlyBudget: args.monthlyBudget,
      budgetMode: args.budgetMode,
      autoReport,
    });
  }, [
    args.budgetMode,
    args.monthlyBudget,
    accounts,
    loans,
    incomes,
    entries,
    rules,
    statuses,
    buffer,
  ]);
}
