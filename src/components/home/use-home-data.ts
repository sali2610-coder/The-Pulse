"use client";

// Phase 429 — Home data hook. Pure read-side adapter over the
// existing engines. No new math; composes outputs from:
//   - useFinanceStore (store selectors)
//   - getLiquidityCurve (Time engine — canonical balance walk)
//   - buildFinancialSnapshot (EOM forecast)
//   - getCreditExposure / getMonthlyIncome / getActivityFeed
//   - buildObligationsOverview (loans + recurring)
//
// Returns the exact slice each Home section needs. Centralized so
// the section components stay presentational and the 3-second test
// always reads from one shape.

import { useMemo } from "react";

import { useFinanceStore } from "@/lib/store";
import {
  buildEngineCtx,
  getActivityFeed,
  getCreditExposure,
  getLiquidityCurve,
  getMonthlyIncome,
} from "@/lib/financial-engine";
import { buildFinancialSnapshot } from "@/lib/financial-snapshot";
import { buildObligationsOverview } from "@/lib/obligations-overview";
import { currentMonthKey } from "@/lib/dates";

export type HomeData = {
  ready: boolean;
  hasAnchors: boolean;
  livBalance: number;
  startingBalance: number;
  eomForecast: number;
  eomBudget: number;
  safetyState: "calm" | "watch" | "stress";
  safetyLabel: string;
  delta24h: number;
  delta24hCount: number;
  lastOutLabel: string | null;
  nextEvent: {
    label: string;
    amount: number;
    whenISO: string;
  } | null;
  pendingCount: number;
  loansThisMonth: number;
  fixedThisMonth: number;
  cardsThisMonth: number;
  incomeThisMonth: number;
  upcomingFortnight: Array<{
    label: string;
    amount: number;
    whenISO: string;
    kind: "income" | "loan" | "card" | "bank_debit";
  }>;
  recentActivity: Array<{
    id: string;
    label: string;
    amount: number;
    whenISO: string;
    direction: "in" | "out";
    isWithdrawal: boolean;
  }>;
};

const EMPTY: HomeData = {
  ready: false,
  hasAnchors: false,
  livBalance: 0,
  startingBalance: 0,
  eomForecast: 0,
  eomBudget: 0,
  safetyState: "calm",
  safetyLabel: "—",
  delta24h: 0,
  delta24hCount: 0,
  lastOutLabel: null,
  nextEvent: null,
  pendingCount: 0,
  loansThisMonth: 0,
  fixedThisMonth: 0,
  cardsThisMonth: 0,
  incomeThisMonth: 0,
  upcomingFortnight: [],
  recentActivity: [],
};

export function useHomeData(): HomeData {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  return useMemo(() => {
    if (!hydrated) return EMPTY;
    const ctx = buildEngineCtx({
      accounts,
      loans,
      incomes,
      rules,
      statuses,
      entries,
      monthlyBudget,
      monthKey: currentMonthKey(),
    });
    const curve = getLiquidityCurve(ctx, 35);
    const snapshot = buildFinancialSnapshot({
      accounts,
      loans,
      incomes,
      entries,
      rules,
      statuses,
      monthlyBudget,
      monthKey: currentMonthKey(),
      now: ctx.now,
    });
    const exposure = getCreditExposure(ctx);
    const income = getMonthlyIncome(ctx);
    const obligations = buildObligationsOverview({
      loans,
      rules,
      accounts,
      monthKey: currentMonthKey(),
      now: ctx.now,
    });
    const feed = getActivityFeed(ctx);

    const hasAnchors = accounts.some(
      (a) => a.active && a.kind === "bank" && typeof a.anchorBalance === "number",
    );
    const live = curve.points[0]?.balance ?? snapshot.currentBalance;
    const eom = snapshot.projectedBalanceOnFirstOfNextMonth;
    const budget = snapshot.monthlyBudget ?? monthlyBudget ?? 0;
    const safetyState: HomeData["safetyState"] =
      eom < 0 ? "stress" : eom < (budget || 0) * 0.15 ? "watch" : "calm";
    const safetyLabel =
      safetyState === "calm"
        ? "בטוח"
        : safetyState === "watch"
          ? "צפוף"
          : "חריגה";

    // ── Delta vs last 24h: walk activity feed, accumulate out-row
    //    amounts that occurred since (now - 24h).
    const horizon24 = ctx.now.getTime() - 24 * 60 * 60 * 1000;
    let delta24h = 0;
    let delta24hCount = 0;
    let lastOutLabel: string | null = null;
    for (const row of feed.rows) {
      if (row.direction !== "out") continue;
      if (new Date(row.whenISO).getTime() < horizon24) continue;
      delta24h += row.amount;
      delta24hCount += 1;
      if (!lastOutLabel) lastOutLabel = row.title;
    }

    // ── Next event = first future curve event (income/loan/card/bank)
    const future = curve.points
      .flatMap((p) => p.events)
      .filter((e) => new Date(e.whenISO).getTime() > ctx.now.getTime())
      .sort(
        (a, b) =>
          new Date(a.whenISO).getTime() - new Date(b.whenISO).getTime(),
      );
    const next = future[0];

    // ── Upcoming fortnight from curve
    const fortHorizon = ctx.now.getTime() + 14 * 24 * 60 * 60 * 1000;
    const upcoming = future
      .filter((e) => new Date(e.whenISO).getTime() <= fortHorizon)
      .slice(0, 8)
      .map((e) => ({
        label: e.label,
        amount: Math.abs(e.amount),
        whenISO: e.whenISO,
        kind: e.kind,
      }));

    // ── Recent activity (already in feed; tight 4)
    const recent = feed.rows.slice(0, 4).map((r, i) => ({
      id: r.entryId ?? r.refId ?? `row-${r.whenISO}-${i}`,
      label: r.title,
      amount: r.amount,
      whenISO: r.whenISO,
      direction: r.direction,
      isWithdrawal: r.isWithdrawal,
    }));

    // ── Pending count: needsConfirmation + bankPending
    const pendingCount = entries.filter(
      (e) =>
        (e.needsConfirmation && !e.confirmedAt) || e.bankPending === true,
    ).length;

    return {
      ready: true,
      hasAnchors,
      livBalance: Math.round(live),
      startingBalance: Math.round(curve.startingBalance),
      eomForecast: Math.round(eom),
      eomBudget: Math.round(budget),
      safetyState,
      safetyLabel,
      delta24h: Math.round(delta24h),
      delta24hCount,
      lastOutLabel,
      nextEvent: next
        ? {
            label: next.label,
            amount: Math.abs(next.amount),
            whenISO: next.whenISO,
          }
        : null,
      pendingCount,
      loansThisMonth: Math.round(obligations.loansMonthly),
      fixedThisMonth: Math.round(obligations.fixedMonthly),
      cardsThisMonth: Math.round(exposure.total),
      incomeThisMonth: Math.round(income.total),
      upcomingFortnight: upcoming,
      recentActivity: recent,
    };
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
}
