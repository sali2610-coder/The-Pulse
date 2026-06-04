"use client";

// Phase 358 — TimeScreen engine hook.
//
// Pure read-side adapter over the existing financial engines. NO new
// math; this hook only composes outputs from:
//
//   liquidityCurve            — day-by-day balance series
//   buildFinancialSnapshot    — current bank + EOM projection
//   forecastHealthScore       — five-band stability index
//
// Exposes a single TimeFrame the screen renders. The offset is the
// only piece of UI state the hook receives; everything else flows
// from the store.

import { useMemo } from "react";

import { useFinanceStore } from "@/lib/store";
import { liquidityCurve, type LiquidityCurve } from "@/lib/liquidity-curve";
import { buildFinancialSnapshot } from "@/lib/financial-snapshot";
import {
  forecastHealthScore,
  type ForecastHealth,
} from "@/lib/forecast-health";
import { currentMonthKey } from "@/lib/dates";
import { todayPulse } from "@/lib/today-pulse";

export type CheckpointKind =
  | "now"
  | "salary"
  | "plus7"
  | "plus14"
  | "eom"
  | "next1"
  | "next10";

export type Checkpoint = {
  kind: CheckpointKind;
  /** Hebrew label for the chip + voice line. */
  label: string;
  /** Day offset from today (0 = today). */
  offset: number;
  /** ISO date this checkpoint resolves to (start of day). */
  iso: string;
};

export type TimeFrame = {
  /** True once the persisted store hydrated; before this all values
   *  return null so the screen can render a calm skeleton without
   *  flashing zeros. */
  ready: boolean;
  /** Balance at the cursor offset. */
  balance: number;
  /** Starting bank balance (Σ active anchors). */
  startingBalance: number;
  /** ISO date the cursor is parked on. */
  cursorISO: string;
  /** Days from today to cursor (0 = live). */
  cursorOffset: number;
  /** Maximum offset the curve can reach. */
  maxOffset: number;
  /** Stability index at cursor — score + band + label + reason. */
  health: ForecastHealth | null;
  /** Snapshot of cumulative inflow/outflow between today and cursor. */
  windowInflow: number;
  windowOutflow: number;
  /** Bottom-line snapshot (EOM). Reused by the river. */
  snapshotEom: ReturnType<typeof buildFinancialSnapshot> | null;
  /** Full curve so child components can light specific events. */
  curve: LiquidityCurve | null;
  /** Checkpoint list — order matches horizon rail. */
  checkpoints: Checkpoint[];
  /** True when no bank anchor is set (screen renders an empty state). */
  noAnchors: boolean;
};

function daysBetween(target: Date, now: Date): number {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function offsetToDayOfMonth(now: Date, day: number): number {
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), day);
  if (thisMonth.getTime() > now.getTime()) return daysBetween(thisMonth, now);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, day);
  return daysBetween(nextMonth, now);
}

function offsetToEom(now: Date): number {
  const eom = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return Math.max(0, daysBetween(eom, now));
}

function offsetToDayOfNextMonth(now: Date, day: number): number {
  const target = new Date(now.getFullYear(), now.getMonth() + 1, day);
  return Math.max(0, daysBetween(target, now));
}

export function useTimeEngine(offset: number | null): TimeFrame {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  const curve = useMemo(() => {
    if (!hydrated) return null;
    return liquidityCurve({
      accounts,
      loans,
      incomes,
      rules,
      statuses,
      entries,
      windowDays: 60,
    });
  }, [hydrated, accounts, loans, incomes, rules, statuses, entries]);

  const snapshotEom = useMemo(() => {
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
  }, [hydrated, accounts, loans, incomes, entries, rules, statuses, monthlyBudget]);

  const pulse = useMemo(() => {
    if (!hydrated) return null;
    return todayPulse({ entries, rules, statuses, monthlyBudget, incomes });
  }, [hydrated, entries, rules, statuses, monthlyBudget, incomes]);

  const noAnchors = useMemo(() => {
    if (!hydrated) return false;
    return !accounts.some(
      (a) =>
        a.active && a.kind === "bank" && typeof a.anchorBalance === "number",
    );
  }, [hydrated, accounts]);

  const checkpoints = useMemo<Checkpoint[]>(() => {
    if (!curve) return [];
    const now = new Date();
    const points = curve.points;
    const max = Math.max(1, points.length - 1);
    const list: Checkpoint[] = [];
    list.push({
      kind: "now",
      label: "עכשיו",
      offset: 0,
      iso: points[0]?.whenISO ?? now.toISOString(),
    });
    if (curve.nextSalaryAt) {
      const idx = points.findIndex((p) =>
        sameLocalDay(p.whenISO, curve.nextSalaryAt!),
      );
      if (idx > 0) {
        list.push({
          kind: "salary",
          label: "משכורת",
          offset: idx,
          iso: points[idx].whenISO,
        });
      }
    }
    const p7 = Math.min(7, max);
    list.push({ kind: "plus7", label: "+7", offset: p7, iso: points[p7].whenISO });
    const p14 = Math.min(14, max);
    list.push({ kind: "plus14", label: "+14", offset: p14, iso: points[p14].whenISO });
    const eom = Math.min(offsetToEom(now), max);
    list.push({ kind: "eom", label: "סוף החודש", offset: eom, iso: points[eom]?.whenISO ?? "" });
    const n1 = Math.min(offsetToDayOfNextMonth(now, 1), max);
    list.push({ kind: "next1", label: "1 לחודש הבא", offset: n1, iso: points[n1]?.whenISO ?? "" });
    const n10raw = offsetToDayOfMonth(now, 10);
    const n10 = Math.min(n10raw, max);
    list.push({ kind: "next10", label: "10 לחודש הבא", offset: n10, iso: points[n10]?.whenISO ?? "" });
    // Sort by offset asc + dedupe colliding ones (e.g. salary == +7).
    list.sort((a, b) => a.offset - b.offset);
    const dedup: Checkpoint[] = [];
    for (const c of list) {
      const last = dedup[dedup.length - 1];
      if (!last || Math.abs(last.offset - c.offset) > 0) dedup.push(c);
    }
    return dedup;
  }, [curve]);

  const cursorOffset = useMemo(() => {
    if (!curve) return 0;
    const max = Math.max(1, curve.points.length - 1);
    if (offset === null) {
      // Default → next salary if known, else +14.
      const salary = checkpoints.find((c) => c.kind === "salary");
      if (salary) return salary.offset;
      const p14 = checkpoints.find((c) => c.kind === "plus14");
      return p14?.offset ?? Math.min(14, max);
    }
    return Math.max(0, Math.min(max, Math.round(offset)));
  }, [curve, offset, checkpoints]);

  const frame = useMemo<TimeFrame>(() => {
    if (!hydrated || !curve) {
      return {
        ready: false,
        balance: 0,
        startingBalance: 0,
        cursorISO: new Date().toISOString(),
        cursorOffset: 0,
        maxOffset: 0,
        health: null,
        windowInflow: 0,
        windowOutflow: 0,
        snapshotEom: null,
        curve: null,
        checkpoints: [],
        noAnchors: false,
      };
    }
    const points = curve.points;
    const max = Math.max(1, points.length - 1);
    const idx = Math.max(0, Math.min(max, cursorOffset));
    const point = points[idx];

    let inflow = 0;
    let outflow = 0;
    for (let i = 1; i <= idx; i++) {
      for (const ev of points[i].events) {
        if (ev.amount > 0) inflow += ev.amount;
        else outflow += Math.abs(ev.amount);
      }
    }

    const pendingCount = pulse?.pendingForReview ?? 0;
    const openCredit = entries.filter(
      (e) => e.paymentMethod === "credit" && !e.confirmedAt,
    ).length;
    const salaryIso = curve.nextSalaryAt;
    const daysToSalary = salaryIso
      ? Math.round(
          (new Date(salaryIso).getTime() - new Date().getTime()) / 86_400_000,
        )
      : null;

    const health = forecastHealthScore({
      startingBalance: curve.startingBalance,
      projectedBalance: point.balance,
      daysAhead: idx,
      deltaInflow: inflow,
      deltaOutflow: outflow,
      pendingCommitmentsCount: pendingCount,
      openCreditTransactionsCount: openCredit,
      daysToNextSalary: daysToSalary,
    });

    return {
      ready: true,
      balance: Math.round(point.balance),
      startingBalance: Math.round(curve.startingBalance),
      cursorISO: point.whenISO,
      cursorOffset: idx,
      maxOffset: max,
      health,
      windowInflow: Math.round(inflow),
      windowOutflow: Math.round(outflow),
      snapshotEom,
      curve,
      checkpoints,
      noAnchors,
    };
  }, [
    hydrated,
    curve,
    cursorOffset,
    pulse,
    entries,
    snapshotEom,
    checkpoints,
    noAnchors,
  ]);

  return frame;
}

function sameLocalDay(a: string, b: string): boolean {
  const ad = new Date(a);
  const bd = new Date(b);
  return (
    ad.getFullYear() === bd.getFullYear() &&
    ad.getMonth() === bd.getMonth() &&
    ad.getDate() === bd.getDate()
  );
}
