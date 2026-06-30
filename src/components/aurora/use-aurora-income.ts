"use client";

// Phase 444 · AURORA recovery — Income engine reader
//
// UI-only consumer of incomeBreakdown + incomeForMonth. Composes
// per-source rows with next/previous payment dates, recurring
// schedule, 6-month trend, monthly contribution share. No engine
// math touched.

import { useMemo } from "react";

import {
  addMonths,
  currentMonthKey,
  dayWithinMonth,
  monthIndex,
} from "@/lib/dates";
import { incomeBreakdown } from "@/lib/income-breakdown";
import { incomeForMonth } from "@/lib/income-month";
import { useFinanceStore } from "@/lib/store";
import type { Income, MonthKey } from "@/types/finance";

export type AuroraIncomeRow = {
  id: string;
  label: string;
  amount: number;
  share: number;
  dayOfMonth?: number;
  isRefund: boolean;
  isVariable: boolean;
  active: boolean;
  /** ISO of the next expected deposit. */
  nextChargeISO?: string;
  /** ISO of the most recent past deposit (this month if dayOfMonth ≤ today, else last month). */
  previousChargeISO?: string;
  /** Last 6 months of resolved-or-baseline amounts, oldest-first. */
  trend: number[];
  /** Monthly baseline used for the schedule. */
  baselineAmount: number;
  /** True when the user typed an override for the current month. */
  hasOverrideThisMonth: boolean;
  overrideThisMonth?: number;
  /** Optional notes for the workspace card. */
  status: "expected" | "received" | "missing" | "refund-fold";
  daysUntilNext: number;
};

export type AuroraIncomeData = {
  ready: boolean;
  monthKey: MonthKey;
  monthLabel: string;
  monthlyTotal: number;
  baselineMonthly: number;
  activeCount: number;
  refundCredit: number;
  rows: AuroraIncomeRow[];
  /** Sum of past 6 months actuals — for the rolling-12 averages. */
  past6Total: number;
  /** Next-deposit aggregate. */
  nextDepositISO?: string;
  nextDepositLabel?: string;
  nextDepositAmount: number;
  nextDepositInDays: number;
};

const HEBREW_MONTH = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

function labelMonth(monthKey: MonthKey): string {
  const [y, m] = monthKey.split("-").map(Number);
  return `${HEBREW_MONTH[(m ?? 1) - 1]} ${y}`;
}

function previousChargeFor(
  inc: Income,
  monthKey: MonthKey,
  now: Date,
): Date | undefined {
  if (!inc.dayOfMonth) return undefined;
  const thisMonthCharge = dayWithinMonth(monthKey, inc.dayOfMonth);
  if (thisMonthCharge.getTime() <= now.getTime()) {
    return thisMonthCharge;
  }
  const prev = addMonths(monthKey, -1);
  return dayWithinMonth(prev, inc.dayOfMonth);
}

function nextChargeFor(
  inc: Income,
  monthKey: MonthKey,
  now: Date,
): Date | undefined {
  if (!inc.dayOfMonth) return undefined;
  const thisMonthCharge = dayWithinMonth(monthKey, inc.dayOfMonth);
  if (thisMonthCharge.getTime() >= now.getTime()) {
    return thisMonthCharge;
  }
  const next = addMonths(monthKey, 1);
  return dayWithinMonth(next, inc.dayOfMonth);
}

function dayDelta(now: Date, target: Date): number {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function isVariable(inc: Income): boolean {
  const overrides = inc.actualByMonth ?? {};
  const values = Object.values(overrides);
  if (values.length === 0) return false;
  const distinct = new Set(values.map((v) => Math.round(v)));
  return distinct.size > 1;
}

const EMPTY: AuroraIncomeData = {
  ready: false,
  monthKey: "—",
  monthLabel: "—",
  monthlyTotal: 0,
  baselineMonthly: 0,
  activeCount: 0,
  refundCredit: 0,
  rows: [],
  past6Total: 0,
  nextDepositAmount: 0,
  nextDepositInDays: 0,
};

export function useAuroraIncome(): AuroraIncomeData {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);

  return useMemo<AuroraIncomeData>(() => {
    if (!hydrated) return EMPTY;

    const monthKey = currentMonthKey();
    const monthLabel = labelMonth(monthKey);
    const now = new Date();

    const breakdown = incomeBreakdown({
      incomes,
      entries,
      monthKey,
      now,
    });
    const refundCredit = breakdown.sources
      .filter((s) => s.isRefund)
      .reduce((s, r) => s + r.amount, 0);

    const sourceById = new Map(breakdown.sources.map((s) => [s.id, s]));

    // 6-month trailing — oldest first.
    const trailingKeys: MonthKey[] = [];
    for (let i = 5; i >= 0; i--) {
      trailingKeys.push(addMonths(monthKey, -i));
    }

    const activeIncomes = incomes.filter((inc) => inc.active);
    const baselineMonthly = activeIncomes.reduce(
      (sum, inc) => sum + inc.amount,
      0,
    );
    const rows: AuroraIncomeRow[] = activeIncomes
      .map((inc) => {
        const next = nextChargeFor(inc, monthKey, now);
        const prev = previousChargeFor(inc, monthKey, now);
        const trend = trailingKeys.map((k) => incomeForMonth(inc, k));
        const source = sourceById.get(inc.id);
        const amount = source?.amount ?? incomeForMonth(inc, monthKey);
        const share = source?.share ?? 0;
        const override = inc.actualByMonth?.[monthKey];
        const hasOverride =
          typeof override === "number" && Number.isFinite(override);

        const status: AuroraIncomeRow["status"] =
          prev && prev.getTime() <= now.getTime()
            ? source
              ? "received"
              : "missing"
            : "expected";

        return {
          id: inc.id,
          label: inc.label,
          amount: Math.round(amount),
          share,
          dayOfMonth: inc.dayOfMonth,
          isRefund: false,
          isVariable: isVariable(inc),
          active: inc.active,
          nextChargeISO: next?.toISOString(),
          previousChargeISO: prev?.toISOString(),
          trend,
          baselineAmount: inc.amount,
          hasOverrideThisMonth: hasOverride,
          overrideThisMonth: hasOverride ? override : undefined,
          status,
          daysUntilNext: next ? Math.max(0, dayDelta(now, next)) : 0,
        };
      });

    if (refundCredit > 0) {
      rows.push({
        id: "__refunds__",
        label: "זיכויים החודש",
        amount: Math.round(refundCredit),
        share: refundCredit / Math.max(1, breakdown.totalMonthly),
        dayOfMonth: undefined,
        isRefund: true,
        isVariable: false,
        active: true,
        nextChargeISO: undefined,
        previousChargeISO: undefined,
        trend: [],
        baselineAmount: 0,
        hasOverrideThisMonth: false,
        overrideThisMonth: undefined,
        status: "refund-fold",
        daysUntilNext: 0,
      });
    }

    rows.sort((a, b) => b.amount - a.amount);

    // Aggregate next deposit across all sources.
    let nextDepositISO: string | undefined;
    let nextDepositLabel: string | undefined;
    let nextDepositAmount = 0;
    for (const r of rows) {
      if (!r.nextChargeISO) continue;
      if (
        !nextDepositISO ||
        new Date(r.nextChargeISO).getTime() <
          new Date(nextDepositISO).getTime()
      ) {
        nextDepositISO = r.nextChargeISO;
        nextDepositLabel = r.label;
        nextDepositAmount = r.amount;
      }
    }
    const nextDepositInDays = nextDepositISO
      ? Math.max(0, dayDelta(now, new Date(nextDepositISO)))
      : 0;

    const past6Total = trailingKeys.slice(0, 5).reduce((sum, k) => {
      for (const inc of incomes) {
        if (!inc.active) continue;
        sum += incomeForMonth(inc, k);
      }
      return sum;
    }, 0);

    void monthIndex; // explicit no-op for parity with legacy reader

    return {
      ready: true,
      monthKey,
      monthLabel,
      monthlyTotal: Math.round(breakdown.totalMonthly),
      baselineMonthly: Math.round(baselineMonthly),
      activeCount: rows.filter((r) => !r.isRefund).length,
      refundCredit: Math.round(refundCredit),
      rows,
      past6Total: Math.round(past6Total),
      nextDepositISO,
      nextDepositLabel,
      nextDepositAmount: Math.round(nextDepositAmount),
      nextDepositInDays,
    };
  }, [hydrated, incomes, entries]);
}
