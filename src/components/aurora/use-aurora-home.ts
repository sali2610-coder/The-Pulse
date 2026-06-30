"use client";

// Phase 432 part 3 · AURORA v1 — useAuroraHome
//
// Rich read hook composing every engine surface the AURORA Home
// needs. Pure compute; no mutation. Returns a single shape so the
// composition layer stays declarative.
//
// Composes:
//   - useFinanceStore                        (store state)
//   - buildEngineCtx + getLiquidityCurve     (live balance / curve)
//   - buildFinancialSnapshot                 (EOM / current bank)
//   - getCreditExposure                      (card lane total)
//   - getMonthlyIncome                       (income lane total)
//   - getActivityFeed                        (recent activity)
//   - buildObligationsOverview               (loans + fixed totals)
//   - forecastMonthEnd                       (variance / breach)
//   - dailyAllowance                         (safe-to-spend today)

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
import {
  dailyAllowance,
  forecastMonthEnd,
} from "@/lib/forecast";
import { currentMonthKey } from "@/lib/dates";
import {
  DEMO_AURORA_HOME,
  DEMO_CASHFLOW_30D,
  DEMO_CATEGORIES,
  DEMO_GOALS,
  DEMO_INSIGHTS,
  DEMO_SUBSCRIPTIONS,
  DEMO_VELOCITY,
  type DemoCategory,
  type DemoGoal,
  type DemoInsight,
  type DemoSubscription,
} from "./aurora-demo-data";

function daysInMonth(monthKey: string): number {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export type AuroraEventKind =
  | "income"
  | "loan"
  | "card"
  | "bank_debit";

export type AuroraUpcomingEvent = {
  label: string;
  amount: number;
  whenISO: string;
  kind: AuroraEventKind;
  daysUntil: number;
};

export type AuroraActivityRow = {
  id: string;
  entryId?: string;
  label: string;
  amount: number;
  whenISO: string;
  direction: "in" | "out";
  isWithdrawal: boolean;
  isRefund: boolean;
  category?: string;
};

export type AuroraHomeData = {
  ready: boolean;
  hasAnchors: boolean;
  /** Phase 432 part 4 — true when the hook returned its baked-in
   *  demo fixture (used on /aurora-preview reviews + cold loads
   *  with no anchors). The composition surfaces a subtle "תצוגת דמו"
   *  eyebrow so the reviewer knows the numbers are illustrative. */
  isDemo?: boolean;
  // ── Hero
  livBalance: number;
  eomForecast: number;
  eomBudget: number;
  safetyState: "calm" | "watch" | "stress";
  safetyLabel: string;
  monthLabel: string;
  daysToEom: number;
  // ── Today
  spentToday: number;
  dailyAllowanceAmount: number;
  daysRemaining: number;
  // ── 24h
  delta24h: number;
  delta24hCount: number;
  lastOutLabel: string | null;
  // ── Next
  nextEvent: AuroraUpcomingEvent | null;
  // ── Pending
  pendingCount: number;
  // ── Lanes
  loansThisMonth: number;
  fixedThisMonth: number;
  cardsThisMonth: number;
  incomeThisMonth: number;
  // ── Budget
  budgetTotal: number;
  budgetSpent: number;
  budgetRemaining: number;
  budgetPct: number;
  // ── 7-day spend bars
  weeklySpend: Array<{ dayISO: string; amount: number; dayIndex: number }>;
  // ── Upcoming events
  upcomingFortnight: AuroraUpcomingEvent[];
  // ── Recent activity
  recentActivity: AuroraActivityRow[];
  // ── CFO coach sentence (legacy single line)
  coachSentence: string | null;
  coachVariant: "loud" | "soft";
  // ── Phase 4 enrichment surfaces
  cashflow30d: number[];
  topCategories: DemoCategory[];
  goals: DemoGoal[];
  subscriptions: DemoSubscription[];
  velocity: { thisWeek: number; lastWeek: number; pctVsLast: number };
  insights: DemoInsight[];
};

const HEBREW_MONTH = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

const EMPTY: AuroraHomeData = {
  ready: false,
  hasAnchors: false,
  livBalance: 0,
  eomForecast: 0,
  eomBudget: 0,
  safetyState: "calm",
  safetyLabel: "—",
  monthLabel: "—",
  daysToEom: 0,
  spentToday: 0,
  dailyAllowanceAmount: 0,
  daysRemaining: 0,
  delta24h: 0,
  delta24hCount: 0,
  lastOutLabel: null,
  nextEvent: null,
  pendingCount: 0,
  loansThisMonth: 0,
  fixedThisMonth: 0,
  cardsThisMonth: 0,
  incomeThisMonth: 0,
  budgetTotal: 0,
  budgetSpent: 0,
  budgetRemaining: 0,
  budgetPct: 0,
  weeklySpend: [],
  upcomingFortnight: [],
  recentActivity: [],
  coachSentence: null,
  coachVariant: "loud",
  cashflow30d: [],
  topCategories: [],
  goals: [],
  subscriptions: [],
  velocity: { thisWeek: 0, lastWeek: 0, pctVsLast: 0 },
  insights: [],
};

function daysBetween(target: Date, now: Date): number {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function useAuroraHome(): AuroraHomeData {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  return useMemo<AuroraHomeData>(() => {
    if (!hydrated) return EMPTY;

    // Phase 432 part 4 — when the store has no bank anchors
    // (cold /aurora-preview review, freshly cloned repo, anonymous
    // visitor), fall through to the demo fixture so the Home feels
    // alive instead of presenting an empty dashboard. Real users
    // with anchors ALWAYS see live data.
    const hasAnyAnchor = accounts.some(
      (a) => a.active && a.kind === "bank" && typeof a.anchorBalance === "number",
    );
    if (!hasAnyAnchor && entries.length === 0 && loans.length === 0) {
      return {
        ...DEMO_AURORA_HOME,
        cashflow30d: DEMO_CASHFLOW_30D,
        topCategories: DEMO_CATEGORIES,
        goals: DEMO_GOALS,
        subscriptions: DEMO_SUBSCRIPTIONS,
        velocity: DEMO_VELOCITY,
        insights: DEMO_INSIGHTS,
      };
    }

    const monthKey = currentMonthKey();
    const ctx = buildEngineCtx({
      accounts,
      loans,
      incomes,
      rules,
      statuses,
      entries,
      monthlyBudget,
      monthKey,
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
      monthKey,
      now: ctx.now,
    });
    const exposure = getCreditExposure(ctx);
    const income = getMonthlyIncome(ctx);
    const obligations = buildObligationsOverview({
      loans,
      rules,
      accounts,
      monthKey,
      now: ctx.now,
    });
    const feed = getActivityFeed(ctx);
    const forecast = forecastMonthEnd({
      entries,
      rules,
      statuses,
      monthlyBudget,
      monthKey,
      now: ctx.now,
    });
    const allowance = dailyAllowance({
      entries,
      rules,
      statuses,
      monthlyBudget,
      monthKey,
      now: ctx.now,
    });

    const hasAnchors = accounts.some(
      (a) => a.active && a.kind === "bank" && typeof a.anchorBalance === "number",
    );
    const live = curve.points[0]?.balance ?? snapshot.currentBalance;
    const eom = snapshot.projectedBalanceOnFirstOfNextMonth;
    const budget = snapshot.monthlyBudget ?? monthlyBudget ?? 0;
    const totalDays = daysInMonth(monthKey);
    const dayOfMonth = ctx.now.getDate();
    const daysToEom = Math.max(0, totalDays - dayOfMonth);

    // Safety bands — tied to forecast vs budget; danger when negative.
    const safetyState: AuroraHomeData["safetyState"] =
      eom < 0
        ? "stress"
        : budget > 0 && eom < budget * 0.15
          ? "watch"
          : "calm";
    const safetyLabel =
      safetyState === "calm"
        ? "בטוח"
        : safetyState === "watch"
          ? "צפוף"
          : "חריגה";

    // 24h delta from activity feed.
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

    // Next event = first future curve event regardless of kind.
    const future = curve.points
      .flatMap((p) => p.events)
      .filter((e) => new Date(e.whenISO).getTime() > ctx.now.getTime())
      .sort(
        (a, b) =>
          new Date(a.whenISO).getTime() - new Date(b.whenISO).getTime(),
      );

    const nextEvent: AuroraHomeData["nextEvent"] = future[0]
      ? {
          label: future[0].label,
          amount: Math.abs(future[0].amount),
          whenISO: future[0].whenISO,
          kind: future[0].kind,
          daysUntil: daysBetween(new Date(future[0].whenISO), ctx.now),
        }
      : null;

    // Upcoming 14 days.
    const fortHorizon = ctx.now.getTime() + 14 * 86_400_000;
    const upcoming: AuroraUpcomingEvent[] = future
      .filter((e) => new Date(e.whenISO).getTime() <= fortHorizon)
      .slice(0, 6)
      .map((e) => ({
        label: e.label,
        amount: Math.abs(e.amount),
        whenISO: e.whenISO,
        kind: e.kind,
        daysUntil: daysBetween(new Date(e.whenISO), ctx.now),
      }));

    // Recent activity (top 6 rows).
    const recent: AuroraActivityRow[] = feed.rows.slice(0, 6).map((r, i) => ({
      id: r.entryId ?? r.refId ?? `row-${r.whenISO}-${i}`,
      entryId: r.entryId,
      label: r.title,
      amount: r.amount,
      whenISO: r.whenISO,
      direction: r.direction,
      isWithdrawal: r.isWithdrawal,
      isRefund: r.isRefund,
      category: r.category,
    }));

    // Pending count = needsConfirmation + bankPending.
    const pendingCount = entries.filter(
      (e) =>
        (e.needsConfirmation && !e.confirmedAt) || e.bankPending === true,
    ).length;

    // 7-day spend bars — walk last 7 days of feed.
    const weeklyMap = new Map<string, number>();
    for (let d = 6; d >= 0; d--) {
      const day = new Date(ctx.now);
      day.setDate(day.getDate() - d);
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      weeklyMap.set(key, 0);
    }
    for (const row of feed.rows) {
      if (row.direction !== "out") continue;
      const t = new Date(row.whenISO);
      const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
      if (weeklyMap.has(key)) {
        weeklyMap.set(key, (weeklyMap.get(key) ?? 0) + row.amount);
      }
    }
    const weeklySpend = Array.from(weeklyMap.entries()).map(([dayISO, amount], idx) => ({
      dayISO,
      amount: Math.round(amount),
      dayIndex: idx,
    }));

    // Budget.
    const budgetTotal = Math.round(budget);
    const budgetSpent = Math.round(snapshot.actualSpentThisMonth ?? 0);
    const budgetRemaining = Math.max(0, budgetTotal - budgetSpent);
    const budgetPct =
      budgetTotal > 0
        ? Math.min(120, Math.round((budgetSpent / budgetTotal) * 100))
        : 0;

    // CFO sentence — composed deterministically from engine signals.
    let coachSentence: string | null = null;
    let coachVariant: AuroraHomeData["coachVariant"] = "loud";
    if (forecast.variance !== undefined && forecast.variance < 0) {
      coachSentence = `אתה צפוי לחרוג ב-${Math.round(Math.abs(forecast.variance)).toLocaleString("he-IL")} ₪. כדי להישאר בטוח, צריך להוריד את הקצב.`;
      coachVariant = "loud";
    } else if (safetyState === "watch") {
      coachSentence = `המרווח לסוף החודש קצר. נשאר ${Math.round(eom).toLocaleString("he-IL")} ₪ בלבד.`;
      coachVariant = "loud";
    } else if (nextEvent && nextEvent.daysUntil <= 7) {
      coachSentence = `הבא בתור: ${nextEvent.label} בעוד ${nextEvent.daysUntil === 0 ? "היום" : nextEvent.daysUntil === 1 ? "מחר" : `${nextEvent.daysUntil} ימים`} · ${Math.round(nextEvent.amount).toLocaleString("he-IL")} ₪.`;
      coachVariant = "soft";
    } else if (delta24hCount > 0) {
      coachSentence = `מאתמול הוצאת ${Math.round(delta24h).toLocaleString("he-IL")} ₪ ב-${delta24hCount} פעולות. יש לך עוד מרווח.`;
      coachVariant = "soft";
    }

    const [year, monthIdx] = monthKey.split("-").map(Number);
    const monthLabel = `${HEBREW_MONTH[(monthIdx ?? 1) - 1]} ${year}`;

    return {
      ready: true,
      hasAnchors,
      livBalance: Math.round(live),
      eomForecast: Math.round(eom),
      eomBudget: Math.round(budget),
      safetyState,
      safetyLabel,
      monthLabel,
      daysToEom,
      spentToday: Math.round(allowance.spentToday),
      dailyAllowanceAmount: Math.max(0, Math.round(allowance.allowance)),
      daysRemaining: allowance.daysRemaining,
      delta24h: Math.round(delta24h),
      delta24hCount,
      lastOutLabel,
      nextEvent,
      pendingCount,
      loansThisMonth: Math.round(obligations.loansMonthly),
      fixedThisMonth: Math.round(obligations.fixedMonthly),
      cardsThisMonth: Math.round(exposure.total),
      incomeThisMonth: Math.round(income.total),
      budgetTotal,
      budgetSpent,
      budgetRemaining,
      budgetPct,
      weeklySpend,
      upcomingFortnight: upcoming,
      recentActivity: recent,
      coachSentence,
      coachVariant,
      // Phase 4 enrichment — live mode keeps these empty for now;
      // Phase 5 will plumb categoryBreakdown / goals store / a real
      // subscription detector. The composition layer renders
      // graceful empty states.
      cashflow30d: curve.points.map((p) => p.balance),
      topCategories: [],
      goals: [],
      subscriptions: [],
      velocity: { thisWeek: 0, lastWeek: 0, pctVsLast: 0 },
      insights: coachSentence
        ? [
            {
              key: "live-coach",
              kind: "info" as const,
              sentence: coachSentence,
            },
          ]
        : [],
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
