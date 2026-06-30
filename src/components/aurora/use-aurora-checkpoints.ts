"use client";

// Phase 441 · AURORA recovery — Checkpoints engine reader
//
// Reads the same liquidity curve + snapshot the legacy זמן tab read
// and surfaces a rich per-checkpoint breakdown:
//   • Available balance (live)
//   • Expected balance at the checkpoint
//   • Income arriving by then
//   • Outflow by then (cards / loans / bank-debits / cash slices)
//   • Disposable = expected balance after the checkpoint date
//   • Risk band derived from sign + threshold
//
// UI-only consumer. No engine, no formula touched.

import { useMemo } from "react";

import { currentMonthKey } from "@/lib/dates";
import {
  buildEngineCtx,
  getLiquidityCurve,
} from "@/lib/financial-engine";
import { buildFinancialSnapshot } from "@/lib/financial-snapshot";
import type {
  LiquidityCurve,
  LiquidityEvent,
  LiquidityEventKind,
} from "@/lib/liquidity-curve";
import { useFinanceStore } from "@/lib/store";

export type CheckpointKey = "live" | "next2" | "next10" | "eom";

export type AuroraCheckpointBreakdown = {
  key: CheckpointKey;
  label: string;
  shortLabel: string;
  whenISO: string;
  daysUntil: number;
  /** Live anchor balance — same for every checkpoint. */
  availableBalance: number;
  /** Engine-derived expected balance at the checkpoint date. */
  expectedBalance: number;
  /** Σ income events up to and including the checkpoint date. */
  incomeArriving: number;
  /** Σ outflow events up to and including the checkpoint date. */
  outflowLeaving: number;
  /** Per-kind splits of the outflow above. */
  cardsCharges: number;
  loansPaid: number;
  bankDebits: number;
  cashOutflow: number;
  salaryEventsCount: number;
  /** Disposable = projectedBalanceOnFirstOfNextMonth — used as the
   *  "after the checkpoint, how much is really mine?" number. We use
   *  the engine's EOM number unchanged so every screen agrees. */
  disposableAtEom: number;
  state: "safe" | "watch" | "danger";
  /** Sorted list of the events that landed by checkpoint day, used
   *  in the breakdown panel. */
  events: Array<{
    whenISO: string;
    label: string;
    amount: number;
    kind: LiquidityEventKind;
  }>;
};

export type AuroraCheckpointsData = {
  ready: boolean;
  isDemo: boolean;
  monthLabel: string;
  liveBalance: number;
  checkpoints: AuroraCheckpointBreakdown[];
};

const HEBREW_MONTH = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

const EMPTY: AuroraCheckpointsData = {
  ready: false,
  isDemo: false,
  monthLabel: "—",
  liveBalance: 0,
  checkpoints: [],
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
}
function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function stateOf(balance: number): "safe" | "watch" | "danger" {
  if (balance < 0) return "danger";
  if (balance < 1500) return "watch";
  return "safe";
}

function pickPointForDate(
  curve: LiquidityCurve,
  target: Date,
): { whenISO: string; balance: number } | null {
  if (curve.points.length === 0) return null;
  const t = target.getTime();
  let best = curve.points[0];
  let delta = Math.abs(new Date(best.whenISO).getTime() - t);
  for (const p of curve.points) {
    const d = Math.abs(new Date(p.whenISO).getTime() - t);
    if (d < delta) {
      best = p;
      delta = d;
    }
  }
  return { whenISO: best.whenISO, balance: best.balance };
}

function collectEvents(
  curve: LiquidityCurve,
  fromExclusive: Date,
  toInclusive: Date,
): LiquidityEvent[] {
  const lo = fromExclusive.getTime();
  const hi = toInclusive.getTime();
  const out: LiquidityEvent[] = [];
  for (const p of curve.points) {
    for (const e of p.events) {
      const t = new Date(e.whenISO).getTime();
      if (t > lo && t <= hi) out.push(e);
    }
  }
  return out.sort(
    (a, b) =>
      new Date(a.whenISO).getTime() - new Date(b.whenISO).getTime(),
  );
}

function dayDelta(from: Date, to: Date): number {
  return Math.round(
    (startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000,
  );
}

export function useAuroraCheckpoints(): AuroraCheckpointsData {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  return useMemo<AuroraCheckpointsData>(() => {
    if (!hydrated) return EMPTY;

    const monthKey = currentMonthKey();
    const [year, mIdx] = monthKey.split("-").map(Number);
    const monthLabel = `${HEBREW_MONTH[(mIdx ?? 1) - 1]} ${year}`;

    const hasAnyAnchor = accounts.some(
      (a) => a.active && a.kind === "bank" && typeof a.anchorBalance === "number",
    );
    const isDemo = !hasAnyAnchor && entries.length === 0 && loans.length === 0;
    if (isDemo) {
      return { ...EMPTY, ready: true, isDemo: true, monthLabel };
    }

    const ctx = buildEngineCtx({
      accounts, loans, incomes, rules, statuses, entries, monthlyBudget, monthKey,
    });
    const curve = getLiquidityCurve(ctx, 60);
    const snapshot = buildFinancialSnapshot({
      accounts, loans, incomes, entries, rules, statuses, monthlyBudget,
      monthKey, now: ctx.now,
    });
    const live = curve.points[0]?.balance ?? snapshot.currentBalance;
    const eomBalance = snapshot.projectedBalanceOnFirstOfNextMonth;
    const now = ctx.now;

    // Anchor target dates (engine numbers reflect "balance by end of day")
    const eomDate = endOfDay(
      new Date(now.getFullYear(), now.getMonth() + 1, 0),
    );
    const next2 = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 2));
    const next10 = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 10));

    const buildCheckpoint = (
      key: CheckpointKey,
      label: string,
      shortLabel: string,
      target: Date,
      fallbackBalance: number,
    ): AuroraCheckpointBreakdown => {
      const point = pickPointForDate(curve, target);
      const expected = key === "live" ? live : point?.balance ?? fallbackBalance;
      const range = key === "live"
        ? { from: startOfDay(now), to: startOfDay(now) }
        : { from: startOfDay(now), to: target };
      const ev = key === "live" ? [] : collectEvents(curve, range.from, range.to);

      let income = 0,
        outflow = 0,
        cards = 0,
        loansPaid = 0,
        bankDebits = 0,
        cash = 0,
        salaries = 0;
      for (const e of ev) {
        if (e.amount > 0) {
          income += e.amount;
          if (e.kind === "income") salaries += 1;
        } else {
          const out = Math.abs(e.amount);
          outflow += out;
          switch (e.kind) {
            case "card":
              cards += out;
              break;
            case "loan":
              loansPaid += out;
              break;
            case "bank_debit":
              bankDebits += out;
              break;
            default:
              cash += out;
          }
        }
      }

      const whenISO =
        key === "live"
          ? now.toISOString()
          : point?.whenISO ?? target.toISOString();

      return {
        key,
        label,
        shortLabel,
        whenISO,
        daysUntil: dayDelta(now, new Date(whenISO)),
        availableBalance: Math.round(live),
        expectedBalance: Math.round(expected),
        incomeArriving: Math.round(income),
        outflowLeaving: Math.round(outflow),
        cardsCharges: Math.round(cards),
        loansPaid: Math.round(loansPaid),
        bankDebits: Math.round(bankDebits),
        cashOutflow: Math.round(cash),
        salaryEventsCount: salaries,
        disposableAtEom: Math.round(eomBalance),
        state: stateOf(expected),
        events: ev.map((e) => ({
          whenISO: e.whenISO,
          label: e.label,
          amount: e.amount,
          kind: e.kind,
        })),
      };
    };

    const checkpoints: AuroraCheckpointBreakdown[] = [
      buildCheckpoint("live", "LIVE · עכשיו", "LIVE", now, live),
      buildCheckpoint(
        "next2",
        "2 לחודש הבא",
        "2 לחודש",
        next2,
        eomBalance,
      ),
      buildCheckpoint(
        "next10",
        "10 לחודש הבא",
        "10 לחודש",
        next10,
        eomBalance,
      ),
      buildCheckpoint(
        "eom",
        "סוף החודש",
        "סוף חודש",
        eomDate,
        eomBalance,
      ),
    ];

    return {
      ready: true,
      isDemo: false,
      monthLabel,
      liveBalance: Math.round(live),
      checkpoints,
    };
  }, [hydrated, accounts, loans, incomes, rules, statuses, entries, monthlyBudget]);
}
