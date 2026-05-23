// Today-pulse — single struct the living dashboard reads.
//
// Sums spend + count for "today only" (local day window),
// counts pending entries awaiting user action, and surfaces the
// daily allowance + a coarse vibe bucket so the UI can change tone
// without re-deriving thresholds.
//
// Pure compute. Reuses dailyAllowance + sliceForMonth so no number
// drifts from the rest of the dashboard.

import type {
  ExpenseEntry,
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import { monthKeyOf } from "@/lib/dates";
import { sliceForMonth } from "@/lib/projections";
import { dailyAllowance } from "@/lib/forecast";

export type PulseVibe = "calm" | "watch" | "hot";

export type TodayPulse = {
  monthKey: MonthKey;
  /** Total ILS already charged today (slice.chargeDate is today). */
  spentToday: number;
  /** Refund credit posted today (positive). */
  refundedToday: number;
  /** Distinct charge slices that hit today. */
  countToday: number;
  /** Entries still waiting for the user (Wallet partial / awaiting confirm). */
  pendingForReview: number;
  /** Daily allowance — same number DailyAllowanceCard reads. 0 when no budget. */
  allowance: number;
  /** Coarse vibe — drives card glow tint without re-deriving thresholds. */
  vibe: PulseVibe;
};

export function todayPulse(args: {
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  monthlyBudget: number;
  now?: Date;
}): TodayPulse {
  const now = args.now ?? new Date();
  const monthKey: MonthKey = monthKeyOf(now);
  const today = now.getDate();

  let spentToday = 0;
  let refundedToday = 0;
  let countToday = 0;
  let pending = 0;

  for (const e of args.entries) {
    if (e.needsConfirmation && !e.confirmedAt) pending++;
    if (e.needsConfirmation) continue;
    if (e.bankPending) continue;
    if (e.excludeFromBudget) continue;
    if (e.currency && e.currency !== "ILS") continue;
    const slice = sliceForMonth(e, monthKey);
    if (!slice) continue;
    if (slice.chargeDate.getDate() !== today) continue;
    if (slice.chargeDate.getTime() > now.getTime()) continue;
    if (e.isRefund) {
      refundedToday += slice.amount;
    } else {
      spentToday += slice.amount;
      countToday++;
    }
  }

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
    // Vibe gate — tied to today's spend vs the day's mathematical
    // allowance. UI just maps the bucket; no per-card threshold
    // re-derivation.
    if (allowance > 0) {
      const ratio = spentToday / allowance;
      vibe = ratio >= 1.1 ? "hot" : ratio >= 0.75 ? "watch" : "calm";
    } else if (spentToday > 0) {
      // No allowance + spending → already past the daily envelope.
      vibe = "hot";
    }
  }

  return {
    monthKey,
    spentToday: round2(spentToday),
    refundedToday: round2(refundedToday),
    countToday,
    pendingForReview: pending,
    allowance,
    vibe,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
