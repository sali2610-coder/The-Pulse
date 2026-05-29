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
  /** Phase 302 — sum of ExpenseEntry.amount across pending entries
   *  whose chargeDate (or createdAt as fallback) is today. Lets the
   *  UI surface "ממתין לאישור" without hiding the value. */
  pendingTodayAmount: number;
  pendingTodayCount: number;
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
  let pendingTodayAmount = 0;
  let pendingTodayCount = 0;

  // Phase 302 — local-day helper. Uses chargeDate when available,
  // falling back to createdAt. Compares year/month/day instead of
  // bare getDate() so a Jan 1 vs Feb 1 collision is impossible.
  const isSameLocalDay = (iso: string | undefined): boolean => {
    if (!iso) return false;
    const d = new Date(iso);
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === today
    );
  };

  for (const e of args.entries) {
    const isPending =
      (e.needsConfirmation && !e.confirmedAt) || e.bankPending;
    if (isPending) {
      pending++;
      // Pending entries booked for today should be visible in the
      // pulse — labeled "ממתין לאישור" by the UI, not silently
      // dropped. The check tolerates a missing chargeDate (Wallet
      // partials sometimes only carry receivedAt → createdAt).
      if (
        isSameLocalDay(e.chargeDate) ||
        isSameLocalDay(e.createdAt)
      ) {
        pendingTodayAmount += Math.abs(e.amount) / Math.max(1, e.installments);
        pendingTodayCount++;
      }
      continue;
    }
    if (e.excludeFromBudget) continue;
    if (e.currency && e.currency !== "ILS") continue;
    const slice = sliceForMonth(e, monthKey);
    if (!slice) continue;
    // Phase 302 — match by year/month/day. Drop the previous
    // "slice.chargeDate > now" clock filter so an entry booked
    // earlier today (with the slice's noon chargeDate) still counts
    // even when "now" is before noon.
    if (
      slice.chargeDate.getFullYear() !== now.getFullYear() ||
      slice.chargeDate.getMonth() !== now.getMonth() ||
      slice.chargeDate.getDate() !== today
    ) {
      continue;
    }
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
    pendingTodayAmount: round2(pendingTodayAmount),
    pendingTodayCount,
    allowance,
    vibe,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
