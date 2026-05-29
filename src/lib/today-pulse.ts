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

  // Phase 308 — single canonical "today" pipeline.
  //
  // The old implementation routed every entry through sliceForMonth
  // (which silently dropped Wallet partials with no chargeDate) AND
  // short-circuited pending entries before they could be counted.
  // That created exactly the bug the user hit: a ₪1 manual entry
  // showed in RecentActivity but never in TodayPulse.
  //
  // The new pipeline is: for every entry — pending or not, pick
  // chargeDate when it exists, else createdAt. If that ISO falls on
  // today (local year+month+day), the entry counts. Pending entries
  // still feed pendingTodayAmount so the UI can label them, but
  // they also land in spentToday so the headline number reads
  // correctly.
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

  const sliceValue = (e: ExpenseEntry): number => {
    const inst = Math.max(1, e.installments);
    return Math.abs(e.amount) / inst;
  };

  for (const e of args.entries) {
    const isPending =
      (e.needsConfirmation && !e.confirmedAt) || e.bankPending;
    if (isPending) pending++;
    if (e.excludeFromBudget) continue;
    if (e.currency && e.currency !== "ILS") continue;
    if (!isSameLocalDay(e.chargeDate) && !isSameLocalDay(e.createdAt)) {
      continue;
    }
    const value = sliceValue(e);
    if (e.isRefund) {
      refundedToday += value;
      continue;
    }
    spentToday += value;
    countToday++;
    if (isPending) {
      pendingTodayAmount += value;
      pendingTodayCount++;
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
