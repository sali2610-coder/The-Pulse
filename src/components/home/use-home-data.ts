"use client";

// Home v2 · Data composition hook.
//
// UI-only reader that stitches together every existing engine surface
// the redesigned Home needs. Zero engine, store, data-model, or
// business-logic changes. Values are only rounded / labeled for
// display.

import { useMemo } from "react";

import { addMonths, currentMonthKey, dayWithinMonth } from "@/lib/dates";
import { getCategory, type CategoryId } from "@/lib/categories";
import {
  buildEngineCtx,
  getActivityFeed,
  getLiquidityCurve,
  getMonthlyIncome,
  getCreditExposure,
} from "@/lib/financial-engine";
import { buildFinancialSnapshot } from "@/lib/financial-snapshot";
import { buildObligationsOverview } from "@/lib/obligations-overview";
import { forecastMonthEnd, categoryTrends, dailyAllowance } from "@/lib/forecast";
import { actualByPaymentMethod, categoryTotals } from "@/lib/projections";
import { gatherAiInsights, type AiInsight } from "@/lib/ai-insights";
import { getCreditCardStatement } from "@/lib/credit-card-statement";
import { incomeForMonth } from "@/lib/income-month";
import { useFinanceStore } from "@/lib/store";
import type { ExpenseEntry } from "@/types/finance";

// ── Types ─────────────────────────────────────────────────────

export type HomeCheckpoint = {
  key: "live" | "next2" | "next10" | "eom";
  label: string;
  amount: number;
  whenISO: string;
  daysUntil: number;
  state: "safe" | "watch" | "danger";
};

export type HomeUpcomingRow = {
  id: string;
  label: string;
  whenISO: string;
  amount: number;
  direction: "in" | "out";
  kind: "income" | "loan" | "card" | "bank_debit";
  daysUntil: number;
  daysLabel: string;
};

export type HomeObligationLane = {
  key: "loans" | "cards" | "bank" | "cash";
  label: string;
  amount: number;
  share: number;
  color: string;
};

export type HomeCategoryRow = {
  id: CategoryId;
  label: string;
  amount: number;
  color: string;
  deltaPct: number | null;
  merchantCount: number;
};

export type HomeActivityRow = {
  id: string;
  label: string;
  amount: number;
  direction: "in" | "out";
  whenISO: string;
  metaLabel: string;
};

export type HomeInsightWhisper = {
  id: string;
  body: string;
  priority: number;
};

export type HomeLoanRow = {
  id: string;
  label: string;
  monthlyAmount: number;
  progress: number;
  remainingPayments?: number;
  totalPayments?: number;
  nextChargeISO: string;
  status: "starting-soon" | "active" | "ending-soon";
};

export type HomeCardRow = {
  id: string;
  label: string;
  cardLast4?: string;
  color?: string;
  currentTotal: number;
  nextTotal: number;
  transactionCount: number;
  creditLimit?: number;
  currentDebt?: number;
  utilisation?: number;
};

export type HomeIncomeRow = {
  id: string;
  label: string;
  amount: number;
  dayOfMonth: number;
  nextChargeISO: string;
  daysUntil: number;
};

export type HomeBankRow = {
  id: string;
  label: string;
  anchorBalance: number;
  anchorUpdatedAt?: string;
};

export type HomePendingRow = {
  id: string;
  label: string;
  amount: number;
  whenISO: string;
  category: string;
  reason: string;
  source: "manual" | "auto" | "sms" | "wallet";
};

export type HomeDailyAllowance = {
  allowance: number;
  spentToday: number;
  daysRemaining: number;
};

export type HomeSummary = {
  income: number;
  expenses: number;
  remaining: number;
  savings: number;
  savingsRate: number;
};

export type HomeRule = {
  id: string;
  label: string;
  category: string;
  estimatedAmount: number;
  dayOfMonth: number;
  active: boolean;
  paid: boolean;
  status: "paid" | "pending" | "skipped";
  nextChargeISO: string;
};

export type HomeCardEnriched = {
  utilisation?: number;
  remainingCredit?: number;
  creditLimit?: number;
  currentDebt?: number;
};

export type HomeGreeting = {
  headline: string;
  subline: string;
};

export type HomeHealthCheck = {
  key: string;
  label: string;
  status: "safe" | "watch" | "danger";
  statusLabel: string;
  hint: string;
};

export type HomeActivityStats = {
  transactions: number;
  monthlyExpenses: number;
  monthlyIncome: number;
  largestExpense: { label: string; amount: number } | null;
  lastTransaction: HomeActivityRow | null;
  topMerchant: { label: string; count: number } | null;
};

export type HomeData = {
  ready: boolean;
  hasAnchors: boolean;
  monthLabel: string;
  // Hero
  live: number;
  eom: number;
  eomBudget: number;
  budgetUsedPct: number;
  safetyState: "calm" | "watch" | "stress";
  safetyLabel: string;
  delta24h: { amount: number; count: number };
  heroSentence: string;
  // Checkpoints
  checkpoints: HomeCheckpoint[];
  // Sections
  upcoming: HomeUpcomingRow[];
  obligations: {
    total: number;
    lanes: HomeObligationLane[];
  };
  categories: HomeCategoryRow[];
  recent: HomeActivityRow[];
  insight: HomeInsightWhisper | null;
  loans: HomeLoanRow[];
  cards: HomeCardRow[];
  incomes: HomeIncomeRow[];
  banks: HomeBankRow[];
  pending: HomePendingRow[];
  daily: HomeDailyAllowance;
  greeting: HomeGreeting;
  statusSentence: string;
  summary: HomeSummary;
  healthScore: number;
  fixed: HomeRule[];
  healthChecks: HomeHealthCheck[];
  activityStats: HomeActivityStats;
};

const HEBREW_MONTH = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

// ── Helpers ───────────────────────────────────────────────────

function safetyLabelOf(state: "calm" | "watch" | "stress"): string {
  switch (state) {
    case "calm":
      return "בטוח";
    case "watch":
      return "צפוף";
    case "stress":
      return "חריגה";
  }
}

function safetyStateOf(balance: number, budget: number): "safe" | "watch" | "danger" {
  if (balance < 0) return "danger";
  if (budget > 0 && balance < budget * 0.15) return "watch";
  return "safe";
}

function stateWord(state: "calm" | "watch" | "stress"): "safe" | "watch" | "danger" {
  return state === "calm" ? "safe" : state === "watch" ? "watch" : "danger";
}

function pickCurvePointForDate(
  curve: ReturnType<typeof getLiquidityCurve>,
  target: Date,
): { whenISO: string; balance: number } | null {
  if (curve.points.length === 0) return null;
  const targetT = target.getTime();
  let best = curve.points[0];
  let bestDelta = Math.abs(new Date(best.whenISO).getTime() - targetT);
  for (const p of curve.points) {
    const d = Math.abs(new Date(p.whenISO).getTime() - targetT);
    if (d < bestDelta) {
      best = p;
      bestDelta = d;
    }
  }
  return { whenISO: best.whenISO, balance: best.balance };
}

function daysUntil(now: Date, target: Date): number {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

function daysWord(n: number): string {
  if (n === 0) return "היום";
  if (n === 1) return "מחר";
  return `בעוד ${n} ימים`;
}

function relativeMeta(now: Date, target: Date): string {
  const diffMs = now.getTime() - target.getTime();
  if (diffMs < 0) return daysWord(Math.round(-diffMs / 86_400_000));
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "ממש עכשיו";
  if (minutes < 60) return `לפני ${minutes} דק׳`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.round(hours / 24);
  if (days === 1) return "אתמול";
  return `לפני ${days} ימים`;
}

function safeCategory(id: string): { label: string; color: string } {
  try {
    const c = getCategory(id as CategoryId);
    return { label: c.label, color: c.accent };
  } catch {
    return { label: "אחר", color: "#94A3B8" };
  }
}

function heroSentenceOf({
  live,
  eom,
  safetyLabel,
  nextEvent,
}: {
  live: number;
  eom: number;
  safetyLabel: string;
  nextEvent: HomeUpcomingRow | null;
}): string {
  if (nextEvent && nextEvent.kind === "income" && nextEvent.daysUntil <= 5) {
    return `אחרי המשכורת בעוד ${nextEvent.daysUntil} ימים, מרווח של ${ILS.format(eom)} עד סוף החודש.`;
  }
  if (nextEvent && nextEvent.direction === "out" && nextEvent.daysUntil <= 3) {
    return `הבא בתור: ${nextEvent.label} — ${ILS.format(nextEvent.amount)} ${nextEvent.daysLabel}.`;
  }
  if (safetyLabel === "בטוח") {
    return `יתרה יציבה. צפוי לסיים את החודש עם ${ILS.format(eom)}.`;
  }
  if (safetyLabel === "צפוף") {
    return `סוף החודש קרוב. נשארו ${ILS.format(eom)} — כדאי לנווט בזהירות.`;
  }
  return `שים לב: הצפי חוצה לאדום. צפוי גירעון של ${ILS.format(Math.abs(eom))}.`;
}

const EMPTY: HomeData = {
  ready: false,
  hasAnchors: false,
  monthLabel: "—",
  live: 0,
  eom: 0,
  eomBudget: 0,
  budgetUsedPct: 0,
  safetyState: "calm",
  safetyLabel: "—",
  delta24h: { amount: 0, count: 0 },
  heroSentence: "",
  checkpoints: [],
  upcoming: [],
  obligations: { total: 0, lanes: [] },
  categories: [],
  recent: [],
  insight: null,
  loans: [],
  cards: [],
  incomes: [],
  banks: [],
  pending: [],
  daily: { allowance: 0, spentToday: 0, daysRemaining: 0 },
  greeting: { headline: "שלום", subline: "" },
  statusSentence: "",
  summary: { income: 0, expenses: 0, remaining: 0, savings: 0, savingsRate: 0 },
  healthScore: 0,
  fixed: [],
  healthChecks: [],
  activityStats: {
    transactions: 0,
    monthlyExpenses: 0,
    monthlyIncome: 0,
    largestExpense: null,
    lastTransaction: null,
    topMerchant: null,
  },
};

// ── Hook ──────────────────────────────────────────────────────

export function useHomeData(): HomeData {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  return useMemo<HomeData>(() => {
    if (!hydrated) return EMPTY;

    const monthKey = currentMonthKey();
    const [year, mIdx] = monthKey.split("-").map(Number);
    const monthLabel = `${HEBREW_MONTH[(mIdx ?? 1) - 1]} ${year}`;

    const hasAnyAnchor = accounts.some(
      (a) => a.active && a.kind === "bank" && typeof a.anchorBalance === "number",
    );

    const ctx = buildEngineCtx({
      accounts, loans, incomes, rules, statuses, entries, monthlyBudget, monthKey,
    });
    const curve = getLiquidityCurve(ctx, 45);
    const snapshot = buildFinancialSnapshot({
      accounts, loans, incomes, entries, rules, statuses, monthlyBudget,
      monthKey, now: ctx.now,
    });
    const feed = getActivityFeed(ctx);
    const forecast = forecastMonthEnd({
      entries, rules, statuses, monthlyBudget, monthKey, now: ctx.now,
    });
    const now = ctx.now;

    const live = Math.round(curve.points[0]?.balance ?? snapshot.currentBalance);
    const eom = Math.round(snapshot.projectedBalanceOnFirstOfNextMonth);
    const eomBudget = Math.round(monthlyBudget || 0);
    const safetyState =
      eom < 0
        ? "stress"
        : eomBudget > 0 && eom < eomBudget * 0.15
          ? "watch"
          : "calm";
    const safetyLabel = safetyLabelOf(safetyState);
    void forecast;

    // 24h delta from feed
    const horizon24 = now.getTime() - 24 * 60 * 60 * 1000;
    let delta24Amount = 0;
    let delta24Count = 0;
    for (const row of feed.rows) {
      if (row.direction !== "out") continue;
      if (new Date(row.whenISO).getTime() < horizon24) continue;
      delta24Amount += row.amount;
      delta24Count += 1;
    }

    // Budget used pct
    const actualSpent = snapshot.actualSpentThisMonth ?? 0;
    const budgetUsedPct =
      eomBudget > 0
        ? Math.min(120, Math.round((actualSpent / eomBudget) * 100))
        : 0;

    // Upcoming (14 days)
    const fortHorizon = now.getTime() + 14 * 86_400_000;
    const rawUpcoming = curve.points
      .flatMap((p) => p.events)
      .filter((e) => {
        const t = new Date(e.whenISO).getTime();
        return t >= now.getTime() && t <= fortHorizon;
      })
      .sort(
        (a, b) =>
          new Date(a.whenISO).getTime() - new Date(b.whenISO).getTime(),
      );

    const upcoming: HomeUpcomingRow[] = rawUpcoming.slice(0, 3).map((e, i) => {
      const target = new Date(e.whenISO);
      const d = daysUntil(now, target);
      return {
        id: `upcoming-${e.whenISO}-${i}`,
        label: e.label,
        whenISO: e.whenISO,
        amount: Math.round(Math.abs(e.amount)),
        direction: e.amount >= 0 ? "in" : "out",
        kind: e.kind,
        daysUntil: d,
        daysLabel: daysWord(d),
      };
    });
    const nextEvent = upcoming[0] ?? null;

    // Checkpoints
    const next2 = pickCurvePointForDate(
      curve,
      dayWithinMonth(addMonths(monthKey, 1), 2),
    );
    const next10 = pickCurvePointForDate(
      curve,
      dayWithinMonth(addMonths(monthKey, 1), 10),
    );
    const eomDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59);
    const eomPoint = pickCurvePointForDate(curve, eomDate);

    const makeCp = (
      key: HomeCheckpoint["key"],
      label: string,
      point: { whenISO: string; balance: number } | null,
      fallback: number,
    ): HomeCheckpoint => {
      const bal = Math.round(point?.balance ?? fallback);
      return {
        key,
        label,
        amount: bal,
        whenISO: point?.whenISO ?? now.toISOString(),
        daysUntil: point ? daysUntil(now, new Date(point.whenISO)) : 0,
        state: safetyStateOf(bal, eomBudget),
      };
    };
    const checkpoints: HomeCheckpoint[] = [
      {
        key: "live",
        label: "LIVE",
        amount: live,
        whenISO: now.toISOString(),
        daysUntil: 0,
        state: safetyStateOf(live, eomBudget),
      },
      makeCp("next2", "2 לחודש", next2, eom),
      makeCp("next10", "10 לחודש", next10, eom),
      makeCp("eom", "סוף חודש", eomPoint, eom),
    ];

    // Obligations
    const obligations = buildObligationsOverview({
      loans, rules, accounts, monthKey, now,
    });
    const exposure = getCreditExposure(ctx);
    const splitNow = actualByPaymentMethod({ entries, monthKey });
    const loansAmount = Math.round(obligations.loansMonthly);
    const cardsAmount = Math.round(exposure.total);
    const bankAmount = Math.round(
      obligations.housing
        .filter((h) => h.sources.includes("bank"))
        .reduce((s, h) => s + h.monthlyTotal, 0),
    );
    const cashAmount = Math.round(splitNow.cash);
    const oblTotal = loansAmount + cardsAmount + bankAmount + cashAmount;
    const laneShare = (v: number) =>
      oblTotal > 0 ? v / oblTotal : 0;
    const obLanes: HomeObligationLane[] = (
      [
        { key: "loans", label: "הלוואות", amount: loansAmount, share: laneShare(loansAmount), color: "var(--sally-lane-loan)" },
        { key: "cards", label: "אשראי", amount: cardsAmount, share: laneShare(cardsAmount), color: "var(--sally-lane-card)" },
        { key: "bank", label: "בנק", amount: bankAmount, share: laneShare(bankAmount), color: "var(--sally-lane-bank)" },
        { key: "cash", label: "מזומן", amount: cashAmount, share: laneShare(cashAmount), color: "var(--sally-gold-soft)" },
      ] as HomeObligationLane[]
    ).filter((l) => l.amount > 0);

    // Categories
    const totals = categoryTotals({ entries, monthKey });
    const trends = categoryTrends({ entries, monthKey, lookback: 3 });
    const deltaByCat = new Map<string, number>();
    for (const t of trends) {
      if (t.deltaPct !== null) deltaByCat.set(t.category, t.deltaPct);
    }
    const catPairs: Array<[CategoryId, number]> = Array.from(
      totals.entries(),
    ) as Array<[CategoryId, number]>;
    // merchant count per category
    const merchantsByCat = new Map<string, Set<string>>();
    for (const e of entries) {
      if (!e.chargeDate?.startsWith(monthKey)) continue;
      const key = String(e.category);
      const set = merchantsByCat.get(key) ?? new Set<string>();
      set.add((e.merchant ?? e.note ?? "—").trim().toLowerCase());
      merchantsByCat.set(key, set);
    }
    const categories: HomeCategoryRow[] = catPairs
      .map(([id, amount]) => {
        const meta = safeCategory(id);
        return {
          id,
          label: meta.label,
          color: meta.color,
          amount: Math.round(amount),
          deltaPct: deltaByCat.get(id) ?? null,
          merchantCount: merchantsByCat.get(String(id))?.size ?? 0,
        };
      })
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 4);

    // Recent activity
    const recent: HomeActivityRow[] = feed.rows.slice(0, 4).map((row) => ({
      id: row.refId,
      label: row.title,
      amount: Math.round(row.amount),
      direction: row.direction,
      whenISO: row.whenISO,
      metaLabel: relativeMeta(now, new Date(row.whenISO)),
    }));

    // Insight — only surface when severity/urgency merit hero attention.
    const insights = gatherAiInsights({
      entries, rules, statuses, accounts, loans, incomes,
      monthlyBudget, monthKey,
    });
    let insight: HomeInsightWhisper | null = null;
    for (const i of insights.insights) {
      // Only surface high-priority, non-positive insights on the calm Home.
      if (i.group === "positive") continue;
      const strong = i.severity >= 2 || i.urgency >= 2 || i.priority >= 11;
      if (!strong) continue;
      insight = insightToWhisper(i);
      break;
    }
    // Fallback: show the top-priority insight of any kind, once, if
    // nothing strong exists. Keeps section informative on live data.
    if (!insight && insights.insights.length > 0) {
      insight = insightToWhisper(insights.insights[0]);
    }

    // Loans (from obligations overview)
    const obl = buildObligationsOverview({
      loans, rules, accounts, monthKey, now: ctx.now,
    });
    const homeLoans: HomeLoanRow[] = obl.loans.map((row) => {
      const total = row.loan.totalPayments;
      const remaining = row.remainingPayments;
      const paid =
        total !== undefined && remaining !== undefined
          ? Math.max(0, total - remaining)
          : undefined;
      const progress =
        total !== undefined && paid !== undefined && total > 0
          ? Math.max(0, Math.min(1, paid / total))
          : 0;
      return {
        id: row.loan.id,
        label: row.loan.label,
        monthlyAmount: Math.round(row.monthlyAmount),
        progress,
        remainingPayments: remaining,
        totalPayments: total,
        nextChargeISO: row.nextChargeDate.toISOString(),
        status: row.status,
      };
    });

    // Cards (via statement)
    const stmt = getCreditCardStatement({
      accounts, rules, entries, statuses, monthKey,
    });
    const stmtNext = getCreditCardStatement({
      accounts, rules, entries, statuses, monthKey: addMonths(monthKey, 1),
    });
    const homeCards: HomeCardRow[] = stmt.cards.map((c) => {
      const acc = accounts.find((a) => a.id === c.cardId);
      const nextTotal = stmtNext.cards.find((x) => x.cardId === c.cardId)?.total ?? 0;
      const limit = acc?.creditLimit;
      const debt = acc?.currentDebt ?? c.total;
      const util =
        limit && limit > 0 ? Math.min(1, debt / limit) : undefined;
      return {
        id: c.cardId,
        label: c.cardLabel,
        cardLast4: c.cardLast4,
        color: acc?.color,
        currentTotal: Math.round(c.total),
        nextTotal: Math.round(nextTotal),
        transactionCount: c.transactions.length,
        creditLimit: limit !== undefined ? Math.round(limit) : undefined,
        currentDebt: acc?.currentDebt !== undefined ? Math.round(acc.currentDebt) : undefined,
        utilisation: util,
      };
    });

    // Incomes
    const homeIncomes: HomeIncomeRow[] = incomes
      .filter((inc) => inc.active)
      .map((inc) => {
        const thisTarget = dayWithinMonth(monthKey, inc.dayOfMonth);
        const next =
          thisTarget.getTime() >= now.getTime()
            ? thisTarget
            : dayWithinMonth(addMonths(monthKey, 1), inc.dayOfMonth);
        return {
          id: inc.id,
          label: inc.label,
          amount: Math.round(incomeForMonth(inc, monthKey)),
          dayOfMonth: inc.dayOfMonth,
          nextChargeISO: next.toISOString(),
          daysUntil: daysUntil(now, next),
        };
      })
      .sort((a, b) => a.daysUntil - b.daysUntil);

    // Banks
    const homeBanks: HomeBankRow[] = accounts
      .filter((a) => a.kind === "bank")
      .map((a) => ({
        id: a.id,
        label: a.label,
        anchorBalance: Math.round(a.anchorBalance ?? 0),
        anchorUpdatedAt: a.anchorUpdatedAt,
      }));

    // Pending
    const isPending = (e: ExpenseEntry) =>
      !e.confirmedAt && (e.needsConfirmation || e.bankPending);
    const homePending: HomePendingRow[] = entries
      .filter(isPending)
      .map((e) => ({
        id: e.id,
        label: e.merchant ?? e.note ?? "עסקה ממתינה",
        amount: Math.round(e.amount),
        whenISO: e.chargeDate ?? e.createdAt ?? now.toISOString(),
        category: String(e.category ?? "other"),
        reason: e.bankPending
          ? "ממתין באישור הבנק"
          : "ממתין לאישור שלך",
        source: e.source ?? "manual",
      }));

    // Daily allowance
    const alw = dailyAllowance({
      entries, rules, statuses, monthlyBudget, monthKey, now: ctx.now,
    });

    // Fixed expenses (recurring rules) — pull statuses per rule
    const homeFixed: HomeRule[] = rules
      .filter((r) => r.active)
      .map((r) => {
        const st = statuses.find(
          (s) => s.ruleId === r.id && s.monthKey === monthKey,
        );
        const paid = st?.status === "paid";
        const status: HomeRule["status"] =
          st?.status === "paid" ? "paid" : "pending";
        const target = dayWithinMonth(monthKey, r.dayOfMonth);
        const next =
          target.getTime() >= now.getTime()
            ? target
            : dayWithinMonth(addMonths(monthKey, 1), r.dayOfMonth);
        return {
          id: r.id,
          label: r.label,
          category: String(r.category),
          estimatedAmount: Math.round(r.estimatedAmount),
          dayOfMonth: r.dayOfMonth,
          active: r.active,
          paid,
          status,
          nextChargeISO: next.toISOString(),
        };
      })
      .sort((a, b) => a.dayOfMonth - b.dayOfMonth);

    // Deterministic greeting + status sentence
    const hour = now.getHours();
    const greetingHeadline =
      hour >= 5 && hour < 11
        ? "בוקר טוב"
        : hour >= 11 && hour < 17
          ? "צהריים טובים"
          : hour >= 17 && hour < 21
            ? "ערב טוב"
            : "לילה טוב";
    const greetingSubline =
      safetyState === "calm"
        ? "כרגע אתה באזור בטוח."
        : safetyState === "watch"
          ? "החודש מתקדם עם מעט מרווח."
          : "החודש יוצא מכלל המרווח.";

    const statusSentence = (() => {
      if (nextEvent && nextEvent.kind === "income" && nextEvent.daysUntil <= 5) {
        return `עוד ${nextEvent.daysUntil === 0 ? "היום" : nextEvent.daysUntil === 1 ? "מחר" : `${nextEvent.daysUntil} ימים`} המשכורת נכנסת.`;
      }
      if (
        nextEvent &&
        nextEvent.direction === "out" &&
        nextEvent.amount >= 1500 &&
        nextEvent.daysUntil <= 3
      ) {
        return `שים לב, בעוד ${nextEvent.daysUntil === 0 ? "היום" : nextEvent.daysUntil === 1 ? "יום" : `${nextEvent.daysUntil} ימים`} יש חיוב גדול.`;
      }
      if (safetyState === "calm") return "החודש נראה רגוע.";
      if (safetyState === "watch") return "מצב החודש דורש קצת תשומת לב.";
      return "החודש חורג. כדאי לצמצם.";
    })();

    // Monthly summary
    const incomeStats = getMonthlyIncome(ctx);
    const summary: HomeSummary = {
      income: Math.round(incomeStats.total),
      expenses: Math.round(actualSpent),
      remaining: Math.max(0, eomBudget - actualSpent),
      savings: Math.max(0, Math.round(incomeStats.total - actualSpent)),
      savingsRate:
        incomeStats.total > 0
          ? Math.max(
              0,
              Math.min(1, (incomeStats.total - actualSpent) / incomeStats.total),
            )
          : 0,
    };

    // Health score composite — 0..100
    // Signals (weighted):
    //   40% safety band: calm=1, watch=0.55, stress=0
    //   25% budget usage under 100%: linear 100%→0.5, 60%→1
    //   15% pending queue absence: 0 rows = 1, ≥3 rows = 0
    //   10% anchor freshness: any bank anchor <7d = 1, >14d = 0
    //   10% forecast breach absence
    const bandScore = safetyState === "calm" ? 1 : safetyState === "watch" ? 0.55 : 0;
    const budgetScore =
      eomBudget > 0
        ? Math.max(0, Math.min(1, 1 - (actualSpent / eomBudget) * 0.5))
        : 0.7;
    const pendingScore = Math.max(0, 1 - homePending.length / 3);
    const anchorFresh =
      accounts.some(
        (a) =>
          a.active &&
          a.kind === "bank" &&
          a.anchorUpdatedAt &&
          now.getTime() - new Date(a.anchorUpdatedAt).getTime() <
            7 * 86_400_000,
      )
        ? 1
        : accounts.some(
              (a) =>
                a.active &&
                a.kind === "bank" &&
                a.anchorUpdatedAt &&
                now.getTime() - new Date(a.anchorUpdatedAt).getTime() <
                  14 * 86_400_000,
            )
          ? 0.6
          : 0.3;
    const forecastGood = eom >= 0 ? 1 : 0;
    const healthScore = Math.round(
      100 *
        (bandScore * 0.4 +
          budgetScore * 0.25 +
          pendingScore * 0.15 +
          anchorFresh * 0.1 +
          forecastGood * 0.1),
    );

    // Deterministic health checks derived from existing signals — no
    // new engine, no new data.
    const insuranceRules = rules.filter(
      (r) => r.active && /ביטוח|insurance/i.test(r.label ?? ""),
    );
    const insuranceMonthly = insuranceRules.reduce((s, r) => s + r.estimatedAmount, 0);
    const healthRules = rules.filter(
      (r) => r.active && (r.category === "health" || /רופא|רפואי|medical/i.test(r.label ?? "")),
    );
    const monthlyBurn = Math.max(1, actualSpent || obl.monthlyTotal);
    const totalAnchors = accounts
      .filter((a) => a.active && a.kind === "bank")
      .reduce((s, a) => s + (a.anchorBalance ?? 0), 0);
    const emergencyMonths = totalAnchors > 0 ? totalAnchors / monthlyBurn : 0;
    const anchorAgeDays = accounts.reduce((max, a) => {
      if (!a.active || a.kind !== "bank" || !a.anchorUpdatedAt) return max;
      const age =
        (ctx.now.getTime() - new Date(a.anchorUpdatedAt).getTime()) /
        86_400_000;
      return Math.max(max, age);
    }, 0);
    const pendingCountLocal = homePending.length;
    const healthChecks: HomeHealthCheck[] = [
      {
        key: "insurance",
        label: "ביטוחים",
        status: insuranceRules.length >= 2 ? "safe" : insuranceRules.length === 1 ? "watch" : "danger",
        statusLabel:
          insuranceRules.length >= 2
            ? "מסודר"
            : insuranceRules.length === 1
              ? "חסר עוד"
              : "לא מוגדר",
        hint:
          insuranceRules.length > 0
            ? `${insuranceRules.length} פוליסות · ${ILS.format(Math.round(insuranceMonthly))}/חודש`
            : "הוסף פוליסה במסך חיובים קבועים",
      },
      {
        key: "medical",
        label: "רפואי",
        status: healthRules.length >= 1 ? "safe" : "watch",
        statusLabel: healthRules.length >= 1 ? "מסודר" : "לתשומת לב",
        hint:
          healthRules.length > 0
            ? `${healthRules.length} חיובים רפואיים במעקב`
            : "עדיין לא נרשמו חיובים רפואיים",
      },
      {
        key: "emergency",
        label: "קרן חירום",
        status:
          emergencyMonths >= 3 ? "safe" : emergencyMonths >= 1 ? "watch" : "danger",
        statusLabel:
          emergencyMonths >= 3
            ? `${Math.round(emergencyMonths)} חודשים`
            : emergencyMonths >= 1
              ? "נבנית"
              : "חסרה",
        hint: `${ILS.format(Math.round(totalAnchors))} מזומן נגיש`,
      },
      {
        key: "anchor",
        label: "עוגני בנק",
        status:
          anchorAgeDays < 7 ? "safe" : anchorAgeDays < 14 ? "watch" : "danger",
        statusLabel:
          anchorAgeDays < 7 ? "עדכני" : anchorAgeDays < 14 ? "בקרוב" : "ישן",
        hint:
          anchorAgeDays === 0
            ? "עדכני להיום"
            : `עדכון אחרון לפני ${Math.round(anchorAgeDays)} ימים`,
      },
      {
        key: "pending",
        label: "מסמכים חסרים",
        status:
          pendingCountLocal === 0
            ? "safe"
            : pendingCountLocal < 3
              ? "watch"
              : "danger",
        statusLabel:
          pendingCountLocal === 0
            ? "הכל מאושר"
            : `${pendingCountLocal} ממתינות`,
        hint:
          pendingCountLocal === 0
            ? "אין עסקאות ממתינות לאישור"
            : "עסקאות שממתינות לאישור שלך",
      },
    ];

    // Monthly activity stats — derived from feed + entries.
    const monthlyOut = feed.rows
      .filter((r) => r.direction === "out")
      .reduce((s, r) => s + r.amount, 0);
    const monthlyIn = feed.rows
      .filter((r) => r.direction === "in")
      .reduce((s, r) => s + r.amount, 0);
    const largest = feed.rows
      .filter((r) => r.direction === "out")
      .sort((a, b) => b.amount - a.amount)[0];
    const merchantCounts = new Map<string, number>();
    for (const r of feed.rows) {
      const key = (r.title ?? "—").trim();
      if (!key) continue;
      merchantCounts.set(key, (merchantCounts.get(key) ?? 0) + 1);
    }
    const topMerchantPair = Array.from(merchantCounts.entries()).sort(
      (a, b) => b[1] - a[1],
    )[0];
    const activityStats: HomeActivityStats = {
      transactions: feed.rows.length,
      monthlyExpenses: Math.round(monthlyOut),
      monthlyIncome: Math.round(monthlyIn),
      largestExpense: largest
        ? { label: largest.title, amount: Math.round(largest.amount) }
        : null,
      lastTransaction: recent[0] ?? null,
      topMerchant: topMerchantPair
        ? { label: topMerchantPair[0], count: topMerchantPair[1] }
        : null,
    };

    // Hero sentence — deterministic, no new signal.
    const heroSentence = heroSentenceOf({
      live,
      eom,
      safetyLabel,
      nextEvent,
    });

    return {
      ready: true,
      hasAnchors: hasAnyAnchor,
      monthLabel,
      live,
      eom,
      eomBudget,
      budgetUsedPct,
      safetyState,
      safetyLabel,
      delta24h: { amount: Math.round(delta24Amount), count: delta24Count },
      heroSentence,
      checkpoints,
      upcoming,
      obligations: { total: oblTotal, lanes: obLanes },
      categories,
      recent,
      insight,
      loans: homeLoans,
      cards: homeCards,
      incomes: homeIncomes,
      banks: homeBanks,
      pending: homePending,
      daily: {
        allowance: Math.max(0, Math.round(alw.allowance)),
        spentToday: Math.round(alw.spentToday),
        daysRemaining: alw.daysRemaining,
      },
      greeting: { headline: greetingHeadline, subline: greetingSubline },
      statusSentence,
      summary,
      healthScore,
      fixed: homeFixed,
      healthChecks,
      activityStats,
    };
    void stateWord;
  }, [hydrated, accounts, loans, incomes, rules, statuses, entries, monthlyBudget]);
}

function insightToWhisper(i: AiInsight): HomeInsightWhisper {
  // Prefer the short conversational body; fall back to title.
  const body = (i.body ?? i.title).trim();
  return {
    id: i.id,
    body,
    priority: i.priority,
  };
}
