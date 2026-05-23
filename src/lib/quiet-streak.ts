// Quiet-days streak.
//
// Counts consecutive days ending at `now` with ZERO outflow,
// plus the longest such streak in a rolling window. Lifestyle
// nudge — "you haven't spent in 4 days" is more motivating than
// a per-month total.
//
// Pure compute. Uses ORIGINAL entry amounts (not slices) — a
// pre-existing installment slice landing today shouldn't break
// today's silence; only NEW charges that day count.

import type { ExpenseEntry } from "@/types/finance";

export type QuietStreakReport = {
  currentStreak: number;
  longestStreak: number;
  /** Window in days the scan considered. */
  windowDays: number;
  /** Total quiet days in the window. */
  quietDays: number;
};

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

export function quietStreakReport(args: {
  entries: ExpenseEntry[];
  /** Anchor — defaults to `now`. */
  now?: Date;
  /** Rolling window length in days. Default 60. */
  windowDays?: number;
}): QuietStreakReport {
  const now = args.now ?? new Date();
  const windowDays = Math.max(1, args.windowDays ?? 60);
  const todayStart = startOfDay(now);
  const startMs = todayStart.getTime() - (windowDays - 1) * 86_400_000;

  // Build the daily charged-flag array, oldest → newest.
  const flags: boolean[] = new Array(windowDays).fill(false);
  for (const e of args.entries) {
    if (e.isRefund) continue;
    if (e.needsConfirmation) continue;
    if (e.bankPending) continue;
    if (e.excludeFromBudget) continue;
    if (e.currency && e.currency !== "ILS") continue;
    if (e.amount <= 0) continue;
    const t = new Date(e.chargeDate).getTime();
    if (!Number.isFinite(t)) continue;
    const day = startOfDay(new Date(t)).getTime();
    if (day < startMs || day > todayStart.getTime()) continue;
    const idx = Math.floor((day - startMs) / 86_400_000);
    if (idx >= 0 && idx < windowDays) flags[idx] = true;
  }

  // Walk newest → oldest for the current streak.
  let currentStreak = 0;
  for (let i = windowDays - 1; i >= 0; i--) {
    if (flags[i]) break;
    currentStreak += 1;
  }

  // Sweep for the longest run in the window.
  let longestStreak = 0;
  let run = 0;
  let quietDays = 0;
  for (let i = 0; i < windowDays; i++) {
    if (flags[i]) {
      if (run > longestStreak) longestStreak = run;
      run = 0;
    } else {
      run += 1;
      quietDays += 1;
    }
  }
  if (run > longestStreak) longestStreak = run;

  return {
    currentStreak,
    longestStreak,
    windowDays,
    quietDays,
  };
}
