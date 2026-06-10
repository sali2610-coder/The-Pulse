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
import type { LiquidityCurve } from "@/lib/liquidity-curve";
import { buildFinancialSnapshot } from "@/lib/financial-snapshot";
import {
  forecastHealthScore,
  type ForecastHealth,
} from "@/lib/forecast-health";
import { currentMonthKey } from "@/lib/dates";
import { todayPulse } from "@/lib/today-pulse";
// Phase 422 — every Time-tab number routes through the engine. No
// direct liquidityCurve / financial-snapshot calls in the hook.
import {
  buildEngineCtx,
  getLiquidityCurve,
} from "@/lib/financial-engine";

export type CheckpointKind =
  | "now"
  | "day10"
  | "eom"
  | "next2"
  | "next10"
  | "custom";

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
  // Phase 422 — compare day-of-month (not raw timestamps). When TODAY
  // already is `day` (e.g., today is the 10th and the user taps "10"),
  // the chip must mean TODAY → offset 0, not next month's 10th.
  if (now.getDate() <= day) {
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), day);
    return Math.max(0, daysBetween(thisMonth, now));
  }
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, day);
  return Math.max(0, daysBetween(nextMonth, now));
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

  // Phase 422 — single engine ctx feeds both curve + EOM snapshot so
  // every Time chip resolves against the same canonical projection.
  const ctx = useMemo(() => {
    if (!hydrated) return null;
    return buildEngineCtx({
      accounts,
      loans,
      incomes,
      rules,
      statuses,
      entries,
      monthlyBudget,
      monthKey: currentMonthKey(),
    });
  }, [
    hydrated,
    accounts,
    loans,
    incomes,
    rules,
    statuses,
    entries,
    monthlyBudget,
  ]);

  const curve = useMemo<LiquidityCurve | null>(() => {
    if (!ctx) return null;
    return getLiquidityCurve(ctx, 60);
  }, [ctx]);

  const snapshotEom = useMemo(() => {
    if (!ctx) return null;
    return buildFinancialSnapshot({
      accounts: ctx.accounts,
      loans: ctx.loans,
      incomes: ctx.incomes,
      entries: ctx.entries,
      rules: ctx.rules,
      statuses: ctx.statuses,
      monthlyBudget: ctx.monthlyBudget,
      monthKey: ctx.monthKey,
      now: ctx.now,
    });
  }, [ctx]);

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
    // Phase 360 — fixed, financially-meaningful ladder. The order is
    // explicit (LIVE → 10 → סוף חודש → 2 → 10+ → מותאם) and not
    // resorted by offset.
    const list: Checkpoint[] = [];
    list.push({
      kind: "now",
      label: "LIVE",
      offset: 0,
      iso: points[0]?.whenISO ?? now.toISOString(),
    });
    const day10 = Math.min(offsetToDayOfMonth(now, 10), max);
    list.push({
      kind: "day10",
      label: "10",
      offset: day10,
      iso: points[day10]?.whenISO ?? "",
    });
    const eom = Math.min(offsetToEom(now), max);
    list.push({
      kind: "eom",
      label: "סוף חודש",
      offset: eom,
      iso: points[eom]?.whenISO ?? "",
    });
    const n2 = Math.min(offsetToDayOfNextMonth(now, 2), max);
    list.push({
      kind: "next2",
      label: "2",
      offset: n2,
      iso: points[n2]?.whenISO ?? "",
    });
    const n10 = Math.min(offsetToDayOfNextMonth(now, 10), max);
    list.push({
      kind: "next10",
      label: "10+",
      offset: n10,
      iso: points[n10]?.whenISO ?? "",
    });
    // Custom chip — engine slot stays at the user-controlled offset.
    // Default to "max" so the slider has somewhere to scrub.
    list.push({
      kind: "custom",
      label: "מותאם",
      offset: max,
      iso: points[max]?.whenISO ?? "",
    });
    return list;
  }, [curve]);

  const cursorOffset = useMemo(() => {
    if (!curve) return 0;
    const max = Math.max(1, curve.points.length - 1);
    if (offset === null) {
      // Phase 360 — default lands on סוף החודש (most informative
      // single answer for the "where am I heading?" question).
      const eom = checkpoints.find((c) => c.kind === "eom");
      if (eom) return eom.offset;
      return Math.min(14, max);
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

