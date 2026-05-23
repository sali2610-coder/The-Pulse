// Habitual-timing detector.
//
// Quiet CFO assistant signal: for each active recurring rule, look
// at the dayOfMonth of the rule's matched entries over the last 3
// months and report the most consistent day. When the rule's
// declared dayOfMonth drifts more than 3 days from the observed
// median, surface a soft suggestion — never a warning.
//
// Pure compute. Reads matchedRuleId on entries to attribute. Skips
// pending / refund / FX rows.

import type { ExpenseEntry, RecurringRule } from "@/types/finance";

export type HabitualTimingHint = {
  ruleId: string;
  label: string;
  declaredDayOfMonth: number;
  observedMedianDay: number;
  /** observedMedianDay - declaredDayOfMonth, signed. */
  drift: number;
  /** Number of historical charges the median was computed over. */
  sampleSize: number;
};

const LOOKBACK_MS = 90 * 86_400_000;
const DRIFT_THRESHOLD = 3;
const MIN_SAMPLES = 3;

export function habitualTimingHints(args: {
  rules: RecurringRule[];
  entries: ExpenseEntry[];
  now?: Date;
}): HabitualTimingHint[] {
  const now = args.now ?? new Date();
  const cutoff = now.getTime() - LOOKBACK_MS;
  const hints: HabitualTimingHint[] = [];

  for (const rule of args.rules) {
    if (!rule.active) continue;
    const days: number[] = [];
    for (const e of args.entries) {
      if (e.matchedRuleId !== rule.id) continue;
      if (e.needsConfirmation && !e.confirmedAt) continue;
      if (e.bankPending) continue;
      if (e.isRefund) continue;
      if (e.excludeFromBudget) continue;
      if (e.currency && e.currency !== "ILS") continue;
      const ts = new Date(e.chargeDate).getTime();
      if (!Number.isFinite(ts)) continue;
      if (ts < cutoff) continue;
      const d = new Date(ts).getDate();
      if (d >= 1 && d <= 31) days.push(d);
    }
    if (days.length < MIN_SAMPLES) continue;
    const median = medianOf(days);
    const drift = median - rule.dayOfMonth;
    if (Math.abs(drift) < DRIFT_THRESHOLD) continue;
    hints.push({
      ruleId: rule.id,
      label: rule.label,
      declaredDayOfMonth: rule.dayOfMonth,
      observedMedianDay: median,
      drift,
      sampleSize: days.length,
    });
  }

  hints.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));
  return hints;
}

function medianOf(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}
