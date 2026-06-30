"use client";

// Phase 438 · AURORA recovery hooks
//
// Reconstructs the legacy product surfaces (checkpoint forecast,
// total commitments breakdown, cards-by-month) inside the AURORA
// language. UI-only consumer; ALL engine math (curve, snapshot,
// statement, obligations, exposure) is unchanged and untouched.

import { useMemo } from "react";

import { addMonths, currentMonthKey } from "@/lib/dates";
import {
  buildEngineCtx,
  getCreditExposure,
  getLiquidityCurve,
  getMonthlyIncome,
} from "@/lib/financial-engine";
import { buildFinancialSnapshot } from "@/lib/financial-snapshot";
import { buildObligationsOverview } from "@/lib/obligations-overview";
import { getCreditCardStatement, type CardStatement } from "@/lib/credit-card-statement";
import { actualByPaymentMethod } from "@/lib/projections";
import { useFinanceStore } from "@/lib/store";
import { getCategory, type CategoryId } from "@/lib/categories";

export type CheckpointKey = "live" | "next2" | "next10" | "eom" | "plus10";

export type AuroraCheckpoint = {
  key: CheckpointKey;
  label: string;
  whenISO: string;
  balance: number;
  state: "safe" | "watch" | "danger";
};

export type AuroraCommitments = {
  total: number;
  loans: { amount: number; count: number };
  cards: { amount: number; count: number };
  fixed: { amount: number; count: number };
  cash: { amount: number; count: number };
  bank: { amount: number; count: number };
  income: { amount: number; count: number };
};

export type AuroraCardMonth = {
  cardId: string;
  cardLabel: string;
  cardLast4?: string;
  currentTotal: number;
  nextTotal: number;
  /** Items grouped by category for the CURRENT month statement. */
  byCategory: Array<{
    category: CategoryId | "other";
    label: string;
    accent: string;
    amount: number;
    fixedAmount: number;
    oneOffAmount: number;
  }>;
};

export type AuroraRecoveryData = {
  ready: boolean;
  isDemo: boolean;
  monthKey: string;
  monthLabel: string;
  checkpoints: AuroraCheckpoint[];
  commitments: AuroraCommitments;
  cardsByMonth: AuroraCardMonth[];
  /** Σ both months across all cards — used as the recovery header. */
  cardsTotalCurrent: number;
  cardsTotalNext: number;
};

const HEBREW_MONTH = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

const EMPTY: AuroraRecoveryData = {
  ready: false,
  isDemo: false,
  monthKey: "—",
  monthLabel: "—",
  checkpoints: [],
  commitments: {
    total: 0,
    loans: { amount: 0, count: 0 },
    cards: { amount: 0, count: 0 },
    fixed: { amount: 0, count: 0 },
    cash: { amount: 0, count: 0 },
    bank: { amount: 0, count: 0 },
    income: { amount: 0, count: 0 },
  },
  cardsByMonth: [],
  cardsTotalCurrent: 0,
  cardsTotalNext: 0,
};

function stateOf(balance: number): "safe" | "watch" | "danger" {
  if (balance < 0) return "danger";
  if (balance < 1500) return "watch";
  return "safe";
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

function categoryAccent(id: CategoryId | "other"): string {
  try {
    return getCategory(id as CategoryId).accent;
  } catch {
    return "#94A3B8";
  }
}

function categoryLabelOf(id: CategoryId | "other"): string {
  try {
    return getCategory(id as CategoryId).label;
  } catch {
    return "אחר";
  }
}

function statementToCardMonth(
  current: CardStatement,
  next: CardStatement | undefined,
): AuroraCardMonth {
  // Split each category into fixed (rule:) vs one-off (entry:) so the
  // expandable shows the same 3-bucket totals the legacy UI surfaced.
  const fixedByCat = new Map<string, number>();
  const oneOffByCat = new Map<string, number>();
  for (const row of current.transactions) {
    const catKey = (row.category as CategoryId | undefined) ?? "other";
    if (row.id.startsWith("rule:")) {
      fixedByCat.set(catKey, (fixedByCat.get(catKey) ?? 0) + row.amount);
    } else {
      oneOffByCat.set(catKey, (oneOffByCat.get(catKey) ?? 0) + row.amount);
    }
  }
  const cats = new Set<string>([...fixedByCat.keys(), ...oneOffByCat.keys()]);
  const byCategory = Array.from(cats)
    .map((c) => {
      const fixed = fixedByCat.get(c) ?? 0;
      const oneOff = oneOffByCat.get(c) ?? 0;
      const id = c as CategoryId | "other";
      return {
        category: id,
        label: categoryLabelOf(id),
        accent: categoryAccent(id),
        amount: fixed + oneOff,
        fixedAmount: fixed,
        oneOffAmount: oneOff,
      };
    })
    .sort((a, b) => b.amount - a.amount);

  return {
    cardId: current.cardId,
    cardLabel: current.cardLabel,
    cardLast4: current.cardLast4,
    currentTotal: current.total,
    nextTotal: next?.total ?? 0,
    byCategory,
  };
}

export function useAuroraRecovery(): AuroraRecoveryData {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  return useMemo<AuroraRecoveryData>(() => {
    if (!hydrated) return EMPTY;

    const monthKey = currentMonthKey();
    const [year, mIdx] = monthKey.split("-").map(Number);
    const monthLabel = `${HEBREW_MONTH[(mIdx ?? 1) - 1]} ${year}`;
    const nextMonthKey = addMonths(monthKey, 1);

    const hasAnyAnchor = accounts.some(
      (a) => a.active && a.kind === "bank" && typeof a.anchorBalance === "number",
    );
    const isDemo = !hasAnyAnchor && entries.length === 0 && loans.length === 0;
    if (isDemo) {
      return { ...EMPTY, ready: true, isDemo: true, monthKey, monthLabel };
    }

    const ctx = buildEngineCtx({
      accounts, loans, incomes, rules, statuses, entries, monthlyBudget, monthKey,
    });
    const curve = getLiquidityCurve(ctx, 60);
    const snapshot = buildFinancialSnapshot({
      accounts, loans, incomes, entries, rules, statuses, monthlyBudget,
      monthKey, now: ctx.now,
    });
    const obligations = buildObligationsOverview({
      loans, rules, accounts, monthKey, now: ctx.now,
    });
    const exposure = getCreditExposure(ctx);
    const income = getMonthlyIncome(ctx);
    const splitNow = actualByPaymentMethod({ entries, monthKey });

    // ── Checkpoints
    const now = ctx.now;
    const next2 = (() => {
      const target = new Date(now.getFullYear(), now.getMonth() + 1, 2, 12, 0, 0);
      return pickCurvePointForDate(curve, target);
    })();
    const next10 = (() => {
      const target = new Date(now.getFullYear(), now.getMonth() + 1, 10, 12, 0, 0);
      return pickCurvePointForDate(curve, target);
    })();
    const plus10 = (() => {
      const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 10, 12, 0, 0);
      return pickCurvePointForDate(curve, target);
    })();
    const liveBalance = curve.points[0]?.balance ?? snapshot.currentBalance;
    const eomBalance = snapshot.projectedBalanceOnFirstOfNextMonth;

    const checkpoints: AuroraCheckpoint[] = [
      {
        key: "live",
        label: "LIVE",
        whenISO: now.toISOString(),
        balance: Math.round(liveBalance),
        state: stateOf(liveBalance),
      },
      {
        key: "plus10",
        label: "+10 ימים",
        whenISO: plus10?.whenISO ?? now.toISOString(),
        balance: Math.round(plus10?.balance ?? liveBalance),
        state: stateOf(plus10?.balance ?? liveBalance),
      },
      {
        key: "eom",
        label: "סוף חודש",
        whenISO: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString(),
        balance: Math.round(eomBalance),
        state: stateOf(eomBalance),
      },
      {
        key: "next2",
        label: "2 לחודש הבא",
        whenISO: next2?.whenISO ?? now.toISOString(),
        balance: Math.round(next2?.balance ?? eomBalance),
        state: stateOf(next2?.balance ?? eomBalance),
      },
      {
        key: "next10",
        label: "10 לחודש הבא",
        whenISO: next10?.whenISO ?? now.toISOString(),
        balance: Math.round(next10?.balance ?? eomBalance),
        state: stateOf(next10?.balance ?? eomBalance),
      },
    ];

    // ── Commitments — sourced verbatim from existing engine outputs.
    const commitments: AuroraCommitments = {
      total:
        Math.round(obligations.monthlyTotal) +
        Math.round(exposure.total) +
        Math.round(splitNow.cash),
      loans: {
        amount: Math.round(obligations.loansMonthly),
        count: obligations.loans.length,
      },
      cards: {
        amount: Math.round(exposure.total),
        count: exposure.rows.length,
      },
      fixed: {
        amount: Math.round(obligations.fixedMonthly),
        count: obligations.housing.reduce((s, h) => s + h.ruleCount, 0),
      },
      cash: {
        amount: Math.round(splitNow.cash),
        count: entries.filter(
          (e) => e.paymentMethod === "cash" && e.chargeDate?.startsWith(monthKey),
        ).length,
      },
      bank: {
        // Bank lane = obligations whose source is "bank" (recurring
        // bank-debited bills). Already counted under fixedMonthly, so
        // surface it informationally without double-summing into total.
        amount: Math.round(
          obligations.housing
            .filter((h) => h.sources.includes("bank"))
            .reduce((s, h) => s + h.monthlyTotal, 0),
        ),
        count: obligations.housing.filter((h) => h.sources.includes("bank"))
          .length,
      },
      income: {
        amount: Math.round(income.total),
        count: income.rows.length,
      },
    };

    // ── Cards by month
    const stmtNow = getCreditCardStatement({
      accounts, rules, entries, statuses, monthKey,
    });
    const stmtNext = getCreditCardStatement({
      accounts, rules, entries, statuses, monthKey: nextMonthKey,
    });
    const cardsByMonth: AuroraCardMonth[] = stmtNow.cards.map((c) =>
      statementToCardMonth(c, stmtNext.cards.find((x) => x.cardId === c.cardId)),
    );
    // Surface any next-month-only cards too so the recovery view
    // doesn't lose visibility on charges that start next billing
    // cycle.
    for (const nx of stmtNext.cards) {
      if (cardsByMonth.some((c) => c.cardId === nx.cardId)) continue;
      cardsByMonth.push({
        cardId: nx.cardId,
        cardLabel: nx.cardLabel,
        cardLast4: nx.cardLast4,
        currentTotal: 0,
        nextTotal: nx.total,
        byCategory: [],
      });
    }
    cardsByMonth.sort((a, b) => b.currentTotal + b.nextTotal - (a.currentTotal + a.nextTotal));

    return {
      ready: true,
      isDemo: false,
      monthKey,
      monthLabel,
      checkpoints,
      commitments,
      cardsByMonth,
      cardsTotalCurrent: Math.round(stmtNow.total),
      cardsTotalNext: Math.round(stmtNext.total),
    };
  }, [hydrated, accounts, loans, incomes, rules, statuses, entries, monthlyBudget]);
}
