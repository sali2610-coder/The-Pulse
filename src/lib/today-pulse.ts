// Today-pulse — single struct the living Pulse hero reads.
//
// Sums spend + count for "today only" (local day window),
// counts pending entries awaiting user action, and surfaces the
// daily allowance + a coarse vibe bucket so the UI can change tone
// without re-deriving thresholds.
//
// Phase 320 — extended for the Pulse redesign with:
//   • state  : 5-band emotional bucket (calm / balanced / watch /
//              stress / recovery) richer than the legacy vibe.
//   • impact : net effect on the daily envelope (positive = saved,
//              negative = overshoot). Drives the right-hand impact
//              meter.
//   • paceRatio : today / average-of-last-7-days, used to phrase the
//                 "הקצב גבוה ב-X%" insight.
//   • timeline  : hourly events for the waveform overlay (expense /
//                 refund / pending / income).
//   • dynamicInsight : one Hebrew sentence summarizing today.
//
// Pure compute. Reuses dailyAllowance + sliceForMonth so no number
// drifts from the rest of the dashboard.

import type {
  ExpenseEntry,
  Income,
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import { monthKeyOf } from "@/lib/dates";
import { dailyAllowance } from "@/lib/forecast";

export type PulseVibe = "calm" | "watch" | "hot";
export type PulseState =
  | "calm"
  | "balanced"
  | "watch"
  | "stress"
  | "recovery";
export type ImpactBand = "low" | "medium" | "high";
export type TimelineEvent = {
  /** 0..23 — clock hour of the event in local time. */
  hour: number;
  /** ILS slice value (always positive). */
  amount: number;
  kind: "expense" | "refund" | "pending" | "income";
};

export type TodayPulse = {
  monthKey: MonthKey;
  spentToday: number;
  refundedToday: number;
  countToday: number;
  pendingForReview: number;
  pendingTodayAmount: number;
  pendingTodayCount: number;
  allowance: number;
  vibe: PulseVibe;
  /** Phase 320 — 5-band emotional state. */
  state: PulseState;
  /** Daily envelope delta — positive = under, negative = over. */
  impact: number;
  impactBand: ImpactBand;
  /** Today's spend ÷ average daily spend over the last 7 days
   *  (excluding today). 0 when there's no prior-week history. */
  paceRatio: number;
  /** Days until the next active income lands. Null when no incomes
   *  are configured. */
  daysToNextIncome: number | null;
  /** Hourly events for the waveform overlay. Always sorted by hour. */
  timeline: TimelineEvent[];
  /** One sentence summarizing today's Pulse. */
  dynamicInsight: string;
};

const LOOKBACK_DAYS = 7;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function sliceValue(e: ExpenseEntry): number {
  const inst = Math.max(1, e.installments);
  return Math.abs(e.amount) / inst;
}

// Phase 355 — Pulse runs on the REAL transaction time. Read order:
//   occurredAt (when it really happened) → chargeDate (manual
//   back-date / card slice math) → createdAt (when the row entered
//   the store, last-resort fallback only).
// A row recorded today but back-dated to yesterday must NOT land in
// today's Pulse window — the occurredAt field carries that intent.
function effectiveDate(e: ExpenseEntry): Date | null {
  const iso = e.occurredAt ?? e.chargeDate ?? e.createdAt;
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pickState(args: {
  spentToday: number;
  refundedToday: number;
  allowance: number;
  paceRatio: number;
  countToday: number;
}): PulseState {
  const overAllowance = args.allowance > 0 && args.spentToday > args.allowance;
  const wayOver = args.allowance > 0 && args.spentToday > args.allowance * 1.4;
  const wayOverPace = args.paceRatio > 1.5;

  if (wayOver || wayOverPace) return "stress";
  if (
    args.refundedToday > 0 &&
    args.refundedToday >= args.spentToday &&
    args.spentToday > 0
  ) {
    return "recovery";
  }
  if (overAllowance || args.paceRatio >= 1.15) return "watch";
  if (
    args.countToday === 0 ||
    (args.paceRatio > 0 && args.paceRatio < 0.7) ||
    args.spentToday === 0
  ) {
    return "calm";
  }
  return "balanced";
}

function pickImpactBand(impact: number): ImpactBand {
  const abs = Math.abs(impact);
  if (abs < 200) return "low";
  if (abs < 700) return "medium";
  return "high";
}

function dynamicInsightFor(args: {
  state: PulseState;
  paceRatio: number;
  daysToNextIncome: number | null;
  spentToday: number;
  refundedToday: number;
  countToday: number;
}): string {
  const pct = Math.round(Math.abs(args.paceRatio - 1) * 100);
  switch (args.state) {
    case "stress":
      return `הקצב גבוה ב-${pct}% מהממוצע. כדאי להאט.`;
    case "watch":
      if (
        args.daysToNextIncome !== null &&
        args.daysToNextIncome <= 3 &&
        args.daysToNextIncome > 0
      ) {
        return `עוד ${args.daysToNextIncome} ימים למשכורת. כדאי להאט מעט.`;
      }
      return `התקרבת לתקרה היומית. שמור על הקצב.`;
    case "recovery":
      return `זיכויים החזירו את היום למסלול.`;
    case "calm":
      if (args.countToday === 0) return `אין חיובים היום. יום רגוע.`;
      if (
        args.daysToNextIncome !== null &&
        args.daysToNextIncome <= 2 &&
        args.daysToNextIncome > 0
      ) {
        return `עוד ${args.daysToNextIncome} ימים למשכורת. היום רגוע מאוד.`;
      }
      return `היום רגוע יחסית.`;
    case "balanced":
    default:
      if (args.paceRatio >= 0.92 && args.paceRatio <= 1.08) {
        return `המערכת מזהה יציבות השבוע.`;
      }
      if (
        args.daysToNextIncome !== null &&
        args.daysToNextIncome <= 3 &&
        args.daysToNextIncome > 0
      ) {
        return `עוד ${args.daysToNextIncome} ימים למשכורת. הקצב מאוזן.`;
      }
      return `היום מאוזן.`;
  }
}

export function todayPulse(args: {
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  monthlyBudget: number;
  incomes?: Income[];
  now?: Date;
}): TodayPulse {
  const now = args.now ?? new Date();
  const monthKey: MonthKey = monthKeyOf(now);
  const today = now.getDate();
  const todayStart = startOfLocalDay(now);

  let spentToday = 0;
  let refundedToday = 0;
  let countToday = 0;
  let pending = 0;
  let pendingTodayAmount = 0;
  let pendingTodayCount = 0;

  const isSameLocalDay = (iso: string | undefined): boolean => {
    if (!iso) return false;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === today
    );
  };

  // Build timeline + per-day lookback in a single pass.
  const timeline: TimelineEvent[] = [];
  const lookbackTotals = new Map<string, number>(); // dateKey YYYY-MM-DD → ILS

  for (const e of args.entries) {
    const isPending =
      (e.needsConfirmation && !e.confirmedAt) || e.bankPending;
    if (isPending) pending++;
    if (e.excludeFromBudget) continue;
    if (e.currency && e.currency !== "ILS") continue;

    const dt = effectiveDate(e);
    if (!dt) continue;

    const todayMatch =
      dt.getFullYear() === now.getFullYear() &&
      dt.getMonth() === now.getMonth() &&
      dt.getDate() === today;

    if (todayMatch) {
      const value = sliceValue(e);
      if (e.isRefund) {
        refundedToday += value;
        timeline.push({
          hour: dt.getHours(),
          amount: value,
          kind: "refund",
        });
        continue;
      }
      spentToday += value;
      countToday++;
      timeline.push({
        hour: dt.getHours(),
        amount: value,
        kind: isPending ? "pending" : "expense",
      });
      if (isPending) {
        pendingTodayAmount += value;
        pendingTodayCount++;
      }
      continue;
    }

    // Lookback bucket — last LOOKBACK_DAYS days NOT including today.
    const dayMs = 86_400_000;
    const diffDays = Math.floor(
      (todayStart.getTime() - startOfLocalDay(dt).getTime()) / dayMs,
    );
    if (diffDays > 0 && diffDays <= LOOKBACK_DAYS) {
      if (e.isRefund) continue;
      const key = `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
      const value = sliceValue(e);
      lookbackTotals.set(key, (lookbackTotals.get(key) ?? 0) + value);
    }
    void isSameLocalDay;
  }

  // Income markers — incomes due today land at noon. Incomes not due
  // today still drive daysToNextIncome.
  let daysToNextIncome: number | null = null;
  if (args.incomes && args.incomes.length > 0) {
    const daysInThisMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
    ).getDate();
    let best: number | null = null;
    for (const inc of args.incomes) {
      if (!inc.active || inc.amount <= 0) continue;
      const remaining =
        inc.dayOfMonth >= today
          ? inc.dayOfMonth - today
          : daysInThisMonth - today + inc.dayOfMonth;
      if (best === null || remaining < best) best = remaining;
      if (inc.dayOfMonth === today) {
        timeline.push({ hour: 12, amount: inc.amount, kind: "income" });
      }
    }
    daysToNextIncome = best;
  }

  timeline.sort((a, b) => a.hour - b.hour);

  // Daily allowance (same engine as DailyAllowanceCard).
  let allowance = 0;
  let vibe: PulseVibe = "calm";
  if (args.monthlyBudget > 0) {
    const a = dailyAllowance({
      entries: args.entries,
      rules: args.rules,
      statuses: args.statuses,
      monthlyBudget: args.monthlyBudget,
      monthKey,
      now,
    });
    allowance = round2(a.allowance);
    if (allowance > 0) {
      const ratio = spentToday / allowance;
      vibe = ratio >= 1.1 ? "hot" : ratio >= 0.75 ? "watch" : "calm";
    } else if (spentToday > 0) {
      vibe = "hot";
    }
  }

  // paceRatio: today / mean(last LOOKBACK_DAYS days).
  let avg = 0;
  if (lookbackTotals.size > 0) {
    let sum = 0;
    for (const v of lookbackTotals.values()) sum += v;
    avg = sum / LOOKBACK_DAYS; // smooth: divide by full window
  }
  const paceRatio = avg > 0 ? round2(spentToday / avg) : 0;

  const state = pickState({
    spentToday,
    refundedToday,
    allowance,
    paceRatio,
    countToday,
  });

  const impactRaw =
    allowance > 0
      ? allowance - spentToday + refundedToday
      : refundedToday - spentToday;
  const impact = round2(impactRaw);
  const impactBand = pickImpactBand(impact);

  const dynamicInsight = dynamicInsightFor({
    state,
    paceRatio,
    daysToNextIncome,
    spentToday,
    refundedToday,
    countToday,
  });

  return {
    monthKey,
    spentToday: round2(spentToday),
    refundedToday: round2(refundedToday),
    countToday,
    pendingForReview: pending,
    pendingTodayAmount: round2(pendingTodayAmount),
    pendingTodayCount,
    allowance,
    vibe,
    state,
    impact,
    impactBand,
    paceRatio,
    daysToNextIncome,
    timeline,
    dynamicInsight,
  };
}
